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
  "The UK should implement strict regulation on the use of artificial intelligence technologies.",
  "The UK should withdraw from the Paris Climate Agreement.",
  "The UK should increase military support to Ukraine in response to the 2022 Russian invasion.",
  "The UK should mandate COVID-19 vaccinations for all eligible citizens.",
  "The UK should make abortion illegal.",
  "The UK should transition to a socialist economic system, replacing capitalism.",
  "The UK should legalise marijuana for recreational use.",
  "The UK should abolish private schools and integrate them into the state education system.",
  "The UK should defund the NHS."
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
    startTimestamp: new Date().toISOString,
    demographics: {},
    propositionResponses: []
  };

  res.redirect('/consent');
});

// Development mode route - add this right after the existing '/' route
app.get('/dev', async (req, res) => {
  // Initialize session with test data
  req.session.participantData = {
    prolificId: 'test-user',
    studyId: 'test-study',
    sessionId: 'test-session',
    startTimestamp: new Date().toISOString(),
    demographics: {},
    propositionResponses: [],
  };

  res.redirect('/consent');
});

// CONSENT
app.get('/consent', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('consent');
});

// CONSENT - POST
app.post('/consent', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  const consentResponse = req.body.consent;

  // Save consent in session data
  req.session.participantData.consent = consentResponse;

  // If user does not consent, show a thank you page and exit
  if (consentResponse === 'no') {
    return res.render('error', {
      message: 'Thank you for considering our study. As you did not consent to participate, the survey will now end.'
    });
  }

  // Otherwise, continue to demographics
  res.redirect('/demographics');
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

  // Continue to writing screener
  res.redirect('/writing-screener');
});

// WRITING SCREENER
app.get('/writing-screener', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  res.render('writing-screener');
});

// WRITING SCREENER - POST
app.post('/writing-screener', async (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }

  const answer = req.body.iceCreamAnswer.trim();
  
  // Save the answer regardless of assessment
  req.session.participantData.writingScreenerAnswer = answer;

  // Assess the response using GPT-4o
  let screeningPassed = false;
  
  try {
    // Only evaluate if there's sufficient content (more than just a few characters)
    if (answer.length > 5) {
      // Call GPT-4o with the openrouter client for assessment
      const completion = await openrouter_client.chat.completions.create({
        model: "openai/gpt-4o-mini", // Use a cost-effective model for assessment
        messages: [
          { 
            role: "system", 
            content: "You are assessing writing screening responses. Your task is to determine if the response is on-topic and shows minimal writing ability. The bar is very low - any genuine attempt at answering the question should pass. Only fail responses that are completely off-topic, nonsensical, or just random characters. Respond with PASS or FAIL."
          },
          { 
            role: "user", 
            content: `Question: What is your favourite ice cream flavour? Please explain your choice in one or two sentences.\n\nParticipant's answer: "${answer}"\n\nIs this a valid response? Reply with just PASS or FAIL.` 
          }
        ],
        max_tokens: 5,
        temperature: 0,
      });

      const assessment = completion.choices[0].message.content.trim();
      screeningPassed = assessment.includes("PASS");
      
      // Log the assessment result
      console.log(`Writing screener assessment for "${answer}": ${assessment}`);
    } else {
      console.log("Writing screener response too short, failing automatically");
      screeningPassed = false;
    }
  } catch (error) {
    console.error("Error assessing writing screener:", error);
    // If there's an API error, we'll pass the user to avoid false rejections
    screeningPassed = true;
  }

  // Record the screening result
  req.session.participantData.writingScreenerPassed = screeningPassed;

  if (screeningPassed) {
    // Passed the writing screener
    // Randomly assign propositions to the participant 
    const assignedPropositions = getRandomPropositions(propositions, 3);
    req.session.participantData.assignedPropositions = assignedPropositions;

    // Initialize the current proposition index to 0 (zero-based)
    req.session.participantData.currentPropositionIndex = 0;

    // Continue to the first proposition
    return res.redirect('/proposition-intro');
  } else {
    // Failed the writing screener
    // Generate a partial completion code
    const partialCompletionCode = `PARTIAL-${Date.now().toString(36).substring(4)}`;

    // Render an error page with partial compensation information
    return res.render('error', {
      message: 'Thank you for your participation. However, you failed our writing screener, so we are unable to proceed with your submission at this time. You will receive partial compensation using the code below.',
      completionCode: partialCompletionCode
    });
  }
});

// PHASE 1: PROPOSITION RESPONSES

// PROPOSITION INTRO
app.get('/proposition-intro', (req, res) => {
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

  res.render('proposition-intro', {
    proposition: currentProposition,
    index: index + 1, // Display 1-based index to the user
    total: propositions.length
  });
});

// PROPOSITION INTRO - POST
app.post('/proposition-intro', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.assignedPropositions) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Proceed to the proposition opinion screen
  res.redirect('/proposition-rating');
});

// PROPOSITION RATING
app.get('/proposition-rating', (req, res) => {
  // Check if session exists
  if (!req.session.participantData || !req.session.participantData.assignedPropositions) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the current proposition index (zero-based)
  const index = req.session.participantData.currentPropositionIndex;

  // Get the propositions assigned to the participant
  const propositions = req.session.participantData.assignedPropositions;

  // Select the current proposition
  const currentProposition = propositions[index];

  res.render('proposition-rating', {
    proposition: currentProposition,
    index: index + 1, // Display 1-based index to the user
    total: propositions.length
  });
});

// PROPOSITION RATING - POST
app.post('/proposition-rating', (req, res) => {
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
    writer_stance_pre: req.body.stancePre,
    writer_bullets: req.body.bullets,
    writer_paragraph: req.body.paragraph,
    writer_confidence: req.body.confidence,
  });

  // Continue to the affect grid screen
  res.redirect('/proposition-stance-confirmation');
});


// PROPOSITION STANCE CONFIRMATION
app.get('/proposition-stance-confirmation', (req, res) => {
  // Check if session exists
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the last proposition response
  const responses = req.session.participantData.propositionResponses;
  const lastResponse = responses[responses.length - 1];

  // Get current proposition index
  const index = req.session.participantData.currentPropositionIndex;
  const total = req.session.participantData.assignedPropositions.length;

  res.render('proposition-stance-confirmation', {
    proposition: lastResponse.proposition,
    index: index + 1, // Display 1-based index to the user
    total: total
  });
});

// PROPOSITION STANCE CONFIRMATION - POST
app.post('/proposition-stance-confirmation', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    return res.redirect('/');
  }

  // Get the last proposition response and update it with stance confirmation data
  const responses = req.session.participantData.propositionResponses;
  const lastResponse = responses[responses.length - 1];

  // Add stance confirmation data to the last response
  lastResponse.writer_stance_post = req.body.stancePost;

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
  return res.redirect('/proposition-intro');
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
        currentResponse.writer_stance_pre,
        currentResponse.writer_bullets,
        currentResponse.writer_paragraph,
        currentResponse.model_input_condition,
        currentResponse.model_name
      );

      currentResponse.model_paragraph = modelParagraph;
    }

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
  response.model_paragraph_stance = req.body.modelStance;

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

  // Redirect back to first step for next proposition
  res.redirect('/proposition-stance-final');
});


// PROPOSITION STANCE FINAL
app.get('/proposition-stance-final', (req, res) => {
  // Check if session exists
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  const index = req.session.participantData.currentLLMPropositionIndex;
  const response = req.session.participantData.propositionResponses[index];

  res.render('proposition-stance-final', {
    proposition: response.proposition,
    index: index + 1, // Display 1-based index to the user
    total: req.session.participantData.propositionResponses.length
  });
});

// PROPOSITION STANCE FINAL - POST
app.post('/proposition-stance-final', (req, res) => {
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

  // Save final stance data
  response.writer_stance_final = req.body.stanceFinal;

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
  const selected = shuffled.slice(0, count);
  console.log(`Randomly selected ${count} propositions from a pool of ${allPropositions.length}`);
  return selected;
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
  const random = Math.random();

  if (random < 1 / 3) {
    return "stance-based";
  } else if (random < 2 / 3) {
    return "bullets-based";
  } else if (random < 5 / 6) {
    return "rewrite";
  } else {
    return "improve";
  }
}

// This function now returns a Promise
async function generateModelParagraph(proposition, stance, bullets, paragraph, model_input_condition, model_name) {
  // Construct the prompt based on the sub-condition
  let prompt = '';

  switch (model_input_condition) {
    case 'stance-based':
      prompt = `Consider the following political proposition: ${proposition}
On a scale from 0 to 100, where 0 is "strongly disagree", 50 is "ambivalent", and 100 is "strongly agree", my opinion on this proposition is ${stance}.
Please write a short paragraph of 100-150 words for me which explains my opinion.
Do not mention the numeric rating or include any preamble like "Based on the rating, …".
Reply only with the paragraph, nothing else.`;
      break;

    case 'bullets-based':
      prompt = `Consider the following political proposition: ${proposition}
My opinion on this proposition is described by the following bullet points:
${bullets}
Please write a short paragraph of 100-150 words for me which explains my opinion.
Do not include any preamble, like "Based on the bullet points …".
Reply only with the paragraph, nothing else.`;
      break;

    case 'rewrite':
      prompt = `Consider the following political proposition: ${proposition}
I wrote the following paragraph to explain my opinion on this proposition:
"${paragraph}"
Please rewrite this paragraph without changing its length.
Do not include any preamble, like "Based on the original paragraph …".
Reply only with the paragraph, nothing else.`;
      break;

    case 'improve':
      prompt = `Consider the following political proposition: ${proposition}
I wrote the following paragraph to explain my opinion on this proposition:
"${paragraph}"
Please improve this paragraph without changing its length.
Do not include any preamble, like "Based on the original paragraph …".
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