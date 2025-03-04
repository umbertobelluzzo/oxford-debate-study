// app.js - Main Express application file

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
const { OpenAI } = require('openai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config();

// Session configuration
sessionConfig = {
  secret: process.env.SESSION_SECRET || 'fallback-development-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
};

// Initialize OpenRouter API
const openrouter_client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY, // Load API key from .env
  baseURL: 'https://openrouter.ai/api/v1',
});

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});
const bucketName = process.env.AWS_S3_BUCKET

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Apply session middleware
app.use(session(sessionConfig));

// Sample propositions (to be filled with actual study propositions)
const propositions = [
  "The UK should impose economic sanctions on Israel in response to the 2023 invasion of Gaza.",
  "The UK should implement strict regulations on the development and deployment of artificial intelligence technologies",
  "The UK should implement a legally binding target to achieve net-zero carbon emissions by 2030.",
  "The UK should increase military and humanitarian support to Ukraine in response to the 2022 Russian invasion.",
  "The UK should mandate COVID-19 vaccinations for all eligible citizens.",
  "Abortion should be legal and accessible on demand in the UK.",
  "The UK should transition to a socialist economic system, replacing capitalism.",
  "The UK should legalize marijuana for recreational use.",
  "The UK should make public education free and accessible for all students up to the university level.",
  "The UK should adopt a single-payer healthcare system.",
];

// Route to handle Prolific integration
app.get('/', (req, res) => {
  // Get Prolific ID and other params from URL
  const prolificId = req.query.PROLIFIC_PID;
  const studyId = req.query.STUDY_ID;
  const sessionId = req.query.SESSION_ID;

  if (!prolificId) {
    return res.render('error', { message: 'No Prolific ID provided. This study must be accessed through Prolific.' });
  }

  // Initialize session
  req.session.participantData = {
    prolificId,
    studyId,
    sessionId,
    currentStep: 'onboarding',
    demographics: {},
    propositionResponses: []
  };

  res.redirect('/onboarding');
});

// Development mode route - add this right after the existing '/' route
app.get('/dev', async (req, res) => {

  // Initialize session with test data
  req.session.participantData = {
    prolificId: 'test-user',
    studyId: 'test-study',
    sessionId: 'test-session',
    currentStep: 'onboarding',
    demographics: {},
    propositionResponses: [],
  };

  res.redirect('/onboarding');
});

// Onboarding route
app.get('/onboarding', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('onboarding');
});

// Demographics collection
app.get('/demographics', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('demographics');
});

app.post('/demographics', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  // Save demographics data
  req.session.participantData.demographics = {
    age: req.body.age,
    gender: req.body.gender,
    education: req.body.education,
    politicalParty: req.body.politicalParty,
    politicalIdeology: req.body.politicalIdeology
  };

  // Randomly assign 2 proposition
  const assignedPropositions = getRandomPropositions(propositions, 2);
  req.session.participantData.assignedPropositions = assignedPropositions;
  req.session.participantData.currentPropositionIndex = 0;

  res.redirect('/proposition');
});

// Proposition handling
app.get('/proposition', (req, res) => {

  if (!req.session.participantData || !req.session.participantData.assignedPropositions) {
    return res.redirect('/');
  }

  const index = req.session.participantData.currentPropositionIndex;
  const propositions = req.session.participantData.assignedPropositions;

  if (index >= propositions.length) {
    // All propositions completed, move to LLM phase
    req.session.participantData.currentStep = 'llm-assignment';
    return res.redirect('/llm-response');
  }

  const currentProposition = propositions[index];
  res.render('proposition', {
    proposition: currentProposition,
    index: index + 1,
    total: propositions.length
  });
});

app.post('/proposition', (req, res) => {

  if (!req.session.participantData || !req.session.participantData.assignedPropositions) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Ensure propositionResponses array exists
  if (!req.session.participantData.propositionResponses) {
    req.session.participantData.propositionResponses = [];
  }

  const index = req.session.participantData.currentPropositionIndex;
  const currentProposition = req.session.participantData.assignedPropositions[index];

  // Save user response for this proposition
  req.session.participantData.propositionResponses.push({
    proposition: currentProposition,
    writer_stance: req.body.stance,
    writer_bullets: req.body.bullets,
    writer_paragraph: req.body.paragraph,
    timestamp: new Date().toISOString()
  });

  // Move to next proposition
  req.session.participantData.currentPropositionIndex++;

  res.redirect('/proposition');
});

app.get('/llm-response', async (req, res) => {

  // Check if session exists first
  if (!req.session.participantData) {
    console.log("No participant data in session");
    return res.redirect('/');
  }

  // Check if propositionResponses exists and has entries -- necessary for LLM phase
  if (!req.session.participantData.propositionResponses ||
    req.session.participantData.propositionResponses.length === 0) {
    console.log("No proposition responses found");
    return res.redirect('/');
  }

  // Initialize LLM index if not already done
  if (req.session.participantData.currentLLMPropositionIndex === undefined) {
    console.log("Initializing LLM proposition index");
    req.session.participantData.currentLLMPropositionIndex = 0;
  }

  const index = req.session.participantData.currentLLMPropositionIndex;
  const propositionResponses = req.session.participantData.propositionResponses;

  console.log(`LLM proposition index: ${index}, Total responses: ${propositionResponses.length}`);

  // Check if all LLM responses are completed -- if so, redirect to completion
  if (index >= propositionResponses.length) {
    console.log("All LLM responses completed, redirecting to completion");
    return res.redirect('/completion');
  }

  const currentResponse = propositionResponses[index];

  // Randomly assign LLM for this proposition
  currentResponse.model_name = getRandomLLM();
  console.log(`Assigned LLM for proposition ${index}: ${currentResponse.model_name}`);

  // Randomly assign sub-condition for this proposition
  currentResponse.model_input_condition = getRandomSubCondition();
  console.log(`Assigned sub-condition for proposition ${index}: ${currentResponse.model_input_condition}`);

  try {
    // Wait for the modelParagraph Promise to resolve
    const modelParagraph = await generateModelParagraph(
      currentResponse.proposition,
      currentResponse.writer_stance,
      currentResponse.writer_bullets,
      currentResponse.writer_paragraph,
      currentResponse.model_input_condition,
      currentResponse.model_name
    );

    currentResponse.model_paragraph = modelParagraph;

    res.render('llm-response', {
      proposition: currentResponse.proposition,
      modelParagraph: currentResponse.model_paragraph,
      writerParagraph: currentResponse.writer_paragraph,
      index: index + 1,
      total: propositionResponses.length
    });
  } catch (error) {
    console.error("Error generating model paragraph:", error);
    res.render('error', { message: 'Error generating AI response. Please try again.' });
  }
});


app.post('/llm-response', async (req, res) => {

  // Validate session data
  if (!req.session.participantData) {
    console.log("No participant data in session");
    return res.redirect('/');
  }

  // Check if propositionResponses exists and has entries
  if (!req.session.participantData.propositionResponses ||
    req.session.participantData.propositionResponses.length === 0) {
    console.log("No proposition responses found");
    return res.redirect('/');
  }

  const index = req.session.participantData.currentLLMPropositionIndex;
  const response = req.session.participantData.propositionResponses[index];

  // Save LLM interaction data
  response.model_paragraph = req.body.modelParagraph;
  response.model_paragraph_stance = req.body.modelStance;
  response.edited_paragraph = req.body.editedParagraph;
  response.writer_preference = req.body.preference;
  response.writer_preference_reason = req.body.preferenceReason;
  response.writer_preference_reason_other = req.body.reasonOther;

  // Move to next proposition for LLM phase
  req.session.participantData.currentLLMPropositionIndex++;

  // Save data to database/file (simplified here with file storage)
  try {
    await saveParticipantData(req.session.participantData);
    console.log("Data saved successfully");
  } catch (error) {
    console.error("Error saving data:", error);
  }
  
  res.redirect('/llm-response');
});

// Completion page
app.get('/completion', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('completion', {
    completionCode: "PLACEHOLDER CODE"
  });

  // Clear session after completion
  req.session.destroy();
});

// Helper functions
function getRandomPropositions(allPropositions, count) {
  const shuffled = [...allPropositions].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Assign a random LLM. Eventually this will be between GPT-4o, Claude-3.7-Sonnet, Llama-3.1-70B, Qwen-2.5-72B, DeepSeek-V3.
// For now we just return a random cheap model from the list below for testing.
function getRandomLLM() {
  const llms = [
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet",
    "qwen/qwen-2.5-7b-instruct",
    "meta-llama/llama-3.1-8b-instruct:free",
  ];
  return llms[Math.floor(Math.random() * llms.length)];
}

function getRandomSubCondition() {
  const conditions = [
    "stance-based",
    "bullets-based",
    "paraphrase",
    "improve"
  ];
  return conditions[Math.floor(Math.random() * conditions.length)];
}

// This function now returns a Promise
async function generateModelParagraph(proposition, stance, bullets, paragraph, model_input_condition, model_name) {

  // Construct the prompt based on the sub-condition
  let prompt = '';

  switch (model_input_condition) {
    case 'stance-based':
      prompt = `Consider the following political statement: ${proposition}
On a scale from 0 to 100, where 0 is "strongly disagree", 50 is "ambivalent", and 100 is "strongly agree", my opinion on this is ${stance}.
Please write a short paragraph of 100-150 words for me which explains my opinion.
Do not mention the numeric rating.
Reply only with the paragraph, nothing else.`;
      break;

    case 'bullets-based':
      prompt = `Consider the following political statement: ${proposition}
My opinion on this issue is described by the following bullet points:
${bullets}
Please write a short paragraph of 100-150 words for me which explains my opinion.
Do not include any preamble, like “Based on the bullet points…”.
Reply only with the paragraph, nothing else.`;
      break;

    case 'paraphrase':
      prompt = `Consider the following political statement: ${proposition}
I wrote the following paragraph to explain my opinion on this issue:
"${paragraph}"
Please rewrite this paragraph.
Reply only with the paragraph, nothing else.`;
      break;

    case 'improve':
      prompt = `Consider the following political statement: ${proposition}
I wrote the following paragraph to explain my opinion on this issue:
"${paragraph}"
Please improve this paragraph.
Reply only with the improved paragraph, nothing else.`;
      break;

    default:
      throw new Error(`Unknown sub-condition ${model_input_condition}`);
  }

  console.log("Generating paragraph with:", {
    model_name,
    model_input_condition,
    prompt
  });

  try {
    // Call the OpenRouter API
    const completion = await openrouter_client.chat.completions.create({
      model: model_name,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    // Extract the response from the completion
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    throw error; // Re-throw to be handled by the caller
  }
}

async function saveParticipantData(data) {
  try {
    // First try to save to S3
    const s3Result = await saveParticipantDataToS3(data);
    return s3Result;
  } catch (error) {
    console.error("Error in primary save function:", error);
    // Fallback to local file storage
    saveParticipantDataToFile(data);
    return { success: false, error: error.message };
  }
}

// Function to save participant data to S3
async function saveParticipantDataToS3(data) {
  try {
    const filename = `participant_${data.prolificId}_${Date.now()}.json`;

    const params = {
      Bucket: bucketName,
      Key: `participants/${filename}`,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    };

    const result = await s3Client.send(new PutObjectCommand(params));
    console.log(`Data saved to S3: participants/${filename}`);
    return { success: true, key: `participants/${filename}` };
  } catch (error) {
    console.error('Error saving data to S3:', error);
    // Fall back to local storage if S3 fails
    saveParticipantDataToFile(data);
    return { success: false, error: error.message };
  }
}

// Keep your existing file storage function as a backup
function saveParticipantDataToFile(data) {
  const filename = `data/participant_${data.prolificId}_${Date.now()}.json`;
  const dir = path.dirname(filename);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`Data saved locally to ${filename} (S3 backup)`);
}

// Start server
app.listen(port, () => {
  console.log(`Study interface running on http://localhost:${port}/dev`);
});