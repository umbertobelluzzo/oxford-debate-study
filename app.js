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
    demographics: {},
    propositionResponses: [],
  };

  res.redirect('/onboarding');
});

// ONBOARDING
app.get('/onboarding', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('onboarding');
});

// DEMOGRAPHICS
app.get('/demographics', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('demographics');
});

// DEMOGRAPHICS - POST
app.post('/demographics', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  // Save demographics data with all fields from the study design
  req.session.participantData.demographics = {
    age: req.body.age,
    gender: req.body.gender,
    race: req.body.race,
    english: req.body.english,
    education: req.body.education,
    income: req.body.income,
    politicalParty: req.body.politicalParty,
    politicalIdeology: req.body.politicalIdeology
  };

  // Randomly assign propositions to the participant 
  const assignedPropositions = getRandomPropositions(propositions, 1);
  req.session.participantData.assignedPropositions = assignedPropositions;

  // Initialize the current proposition index to 0 (zero-based)
  req.session.participantData.currentPropositionIndex = 0;

  // Continue to the first proposition
  res.redirect('/proposition');
});

// PHASE 1: PROPOSITION RESPONSES

// PROPOSITION STANCE
app.get('/proposition', (req, res) => {
  // Check if session exists
  if (!req.session.participantData || !req.session.participantData.assignedPropositions) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the current proposition index (zero-based)
  const index = req.session.participantData.currentPropositionIndex;

  // Get the propositions assigned to the participant
  const propositions = req.session.participantData.assignedPropositions;

  // Check if all propositions are completed
  if (index >= propositions.length) {
    // If all propositions are completed, move to LLM phase
    // Reset the LLM proposition index to 0 for starting LLM phase
    req.session.participantData.currentLLMPropositionIndex = 0;
    return res.redirect('/llm-stance');
  }

  // Select the current proposition
  const currentProposition = propositions[index];

  // Calculate progress percentage for progress bar
  // Demographics is 10%, each proposition cycle is 15% (45% total for 3 propositions)
  const progressPercentage = 10 + (index * 15);

  res.render('proposition', {
    proposition: currentProposition,
    index: index + 1, // Display 1-based index to the user
    total: propositions.length
  });
});

// PROPOSITION STANCE - POST
app.post('/proposition', (req, res) => {
  // Check if session exists
  if (!req.session.participantData || !req.session.participantData.assignedPropositions) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  const index = req.session.participantData.currentPropositionIndex;
  const currentProposition = req.session.participantData.assignedPropositions[index];

  // Save user response for this proposition with all fields from the study design
  req.session.participantData.propositionResponses.push({
    proposition: currentProposition,
    writer_knowledge: req.body.knowledge,
    writer_importance: req.body.importance,
    writer_stance: req.body.stance,
    writer_bullets: req.body.bullets,
    writer_paragraph: req.body.paragraph,
    writer_confidence: req.body.confidence,
    timestamp: new Date().toISOString()
  });

  // Continue to the affect grid screen
  res.redirect('/affect-grid');
});

// PROPOSITION AFFECT GRID
app.get('/affect-grid', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    return res.redirect('/');
  }

  // Get the last proposition response
  const responses = req.session.participantData.propositionResponses;
  const lastResponse = responses[responses.length - 1];

  // Get current proposition index
  const index = req.session.participantData.currentPropositionIndex;
  const total = req.session.participantData.assignedPropositions.length;

  // Calculate progress percentage: 10% for demographics + index*15% + 10% for emotions + affect grid
  const progressPercentage = 10 + (index * 15) + 10;

  res.render('affect-grid', {
    proposition: lastResponse.proposition,
    writerParagraph: lastResponse.writer_paragraph,
    index: index + 1, // Display 1-based index to the user
    total: total
  });
});

// PROPOSITION AFFECT GRID - POST
app.post('/affect-grid', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    return res.redirect('/');
  }

  // Get the last proposition response and update it with affect grid data
  const responses = req.session.participantData.propositionResponses;
  const lastResponse = responses[responses.length - 1];

  // Add affect grid data to the last response
  lastResponse.writer_affect_grid = {
    x: req.body.gridX,
    y: req.body.gridY
  };

  // Increment the proposition index after completing the full cycle for one proposition
  req.session.participantData.currentPropositionIndex++;

  // Return to the proposition screen to start the next proposition cycle or move to LLM phase
  return res.redirect('/proposition');
});

// PHASE 2: LLM RESPONSES

// LLM STANCE
app.get('/llm-stance', async (req, res) => {
  // Check if session exists
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
  const propositionResponses = req.session.participantData.propositionResponses;

  console.log(`LLM proposition index: ${index}, Total responses: ${propositionResponses.length}`);

  // Check if all LLM responses are completed
  if (index >= propositionResponses.length) {
    console.log("All LLM responses completed, redirecting to final AI usage question");
    return res.redirect('/ai-usage');
  }

  const currentResponse = propositionResponses[index];

  // Randomly assign LLM for this proposition if not already assigned
  if (!currentResponse.model_name) {
    currentResponse.model_name = getRandomLLM();
    console.log(`Assigned LLM for proposition ${index}: ${currentResponse.model_name}`);
  }

  // Randomly assign sub-condition for this proposition if not already assigned
  if (!currentResponse.model_input_condition) {
    currentResponse.model_input_condition = getRandomSubCondition();
    console.log(`Assigned sub-condition for proposition ${index}: ${currentResponse.model_input_condition}`);
  }

  try {
    // Generate model paragraph if not already generated
    if (!currentResponse.model_paragraph) {
      const modelParagraph = await generateModelParagraph(
        currentResponse.proposition,
        currentResponse.writer_stance,
        currentResponse.writer_bullets,
        currentResponse.writer_paragraph,
        currentResponse.model_input_condition,
        currentResponse.model_name
      );

      currentResponse.model_paragraph = modelParagraph;
    }

    // Calculate progress for LLM phase (55% - 85%)
    // 55% baseline (all propositions done) + up to 30% for LLM phase
    const progressPercentage = 55 + (index * 10);

    res.render('llm-stance', {
      proposition: currentResponse.proposition,
      modelParagraph: currentResponse.model_paragraph,
      index: index + 1, // Display 1-based index to the user  
      total: propositionResponses.length
    });
  } catch (error) {
    console.error("Error generating model paragraph:", error);
    res.render('error', { message: 'Error generating AI response. Please try again.' });
  }
});

// LLM STANCE - POST
app.post('/llm-stance', (req, res) => {
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

  // Save stance data
  response.model_paragraph_stance_first_person = req.body.modelStance;

  // Move to edit page
  res.redirect('/llm-edit');
});

// LLM EDIT
app.get('/llm-edit', (req, res) => {
  // Check if session exists
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

  // Make sure we have a model paragraph before proceeding
  if (!response.model_paragraph) {
    console.log("No model paragraph found, redirecting to stance step");
    return res.redirect('/llm-stance');
  }

  // Calculate progress for LLM phase (55% - 85%)
  // 55% baseline + (index * 10%) for stance + 3% for edit
  const progressPercentage = 55 + (index * 10) + 3;

  res.render('llm-edit', {
    proposition: response.proposition,
    modelParagraph: response.model_paragraph,
    index: index + 1, // Display 1-based index to the user
    total: req.session.participantData.propositionResponses.length
  });
});

// LLM EDIT - POST
app.post('/llm-edit', (req, res) => {
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

  // Save edited paragraph
  response.edited_paragraph = req.body.editedParagraph;

  // Move to compare page
  res.redirect('/llm-compare');
});

// LLM COMPARE
app.get('/llm-compare', (req, res) => {
  // Check if session exists
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

  // Make sure we have the required data before proceeding
  if (!response.edited_paragraph) {
    console.log("No edited paragraph found, redirecting to edit step");
    return res.redirect('/llm-edit');
  }

  // Calculate progress for LLM phase (55% - 85%)
  // 55% baseline + (index * 10%) + 3% for edit + 2% for compare = 10% per proposition
  const progressPercentage = 55 + (index * 10) + 5;

  res.render('llm-compare', {
    proposition: response.proposition,
    writerParagraph: response.writer_paragraph,
    editedParagraph: response.edited_paragraph,
    index: index + 1, // Display 1-based index to the user
    total: req.session.participantData.propositionResponses.length
  });
});

// SCREEN: LLM COMPARE - POST
app.post('/llm-compare', (req, res) => {
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

  // Save preference data
  response.writer_preference = req.body.preference;
  response.writer_preference_reason = req.body.preferenceReason;
  response.writer_preference_reason_other = req.body.reasonOther;

  // Move to next proposition for LLM phase
  req.session.participantData.currentLLMPropositionIndex++;

  // Redirect back to first step for next proposition
  res.redirect('/llm-stance');
});

// AI USAGE
app.get('/ai-usage', (req, res) => {
  if (!req.session.participantData) {
    console.log("No participant data in session");
    return res.redirect('/');
  }

  res.render('ai-usage');
});

// AI USAGE - POST
app.post('/ai-usage', async (req, res) => {
  if (!req.session.participantData) {
    console.log("No participant data in session");
    return res.redirect('/');
  }

  // Save AI usage response
  req.session.participantData.used_ai = req.body.usedAI === 'yes';

  // Redirect to completion
  res.redirect('/completion');
});

// SCREEN 10: COMPLETION
app.get('/completion', async (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  // Save the final, complete participant data
  try {
    // Add a completion timestamp
    req.session.participantData.completionTimestamp = new Date().toISOString();

    // Save the full participant data
    await saveParticipantData(req.session.participantData);
    console.log("Participant data saved successfully at completion");
  } catch (error) {
    console.error("Error saving final participant data:", error);
    // Still show completion page even if save fails
  }

  // Generate a completion code - can be more sophisticated if needed
  const completionCode = `STUDY-${Date.now().toString(36).substring(4)}`;

  res.render('completion', {
    completionCode: completionCode
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
Do not include any preamble, like "Based on the bullet points…".
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