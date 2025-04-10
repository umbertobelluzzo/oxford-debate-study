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

// Middleware to require session
function requireSession(req, res, next) {
  if (!req.session.participantData) {
    return res.redirect('/');
  }
  next();
}

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
    startTimestamp: new Date().toISOString(),
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
app.get('/demographics', requireSession, (req, res) => {
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
app.get('/writing-screener', requireSession, (req, res) => {
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
            content: "You are assessing writing screening responses. Your task is to determine if the response is on-topic and shows minimal writing ability. The response should name an ice cream flavour and explain why the writer chose it. You should fail responses that only name the flavour but do not give a reason. Also fail responses that are completely off-topic, nonsensical, or just random characters. Respond only with PASS or FAIL."
          },
          {
            role: "user",
            content: `Question: What is your favourite ice cream flavour and why? Please state and explain your choice in one or two sentences.\n\nParticipant's answer: "${answer}"\n\nIs this a valid response? Reply with just PASS or FAIL.`
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
    req.session.participantData.currentWriterPropositionIndex = 0;

    // Initialize propositionResponses array with the assigned propositions
    // This is the key fix - initializing a proper structure for each proposition
    req.session.participantData.propositionResponses = assignedPropositions.map(proposition => {
      return {
        proposition: proposition,  // Store the proposition text itself
        // Other fields will be added as the participant progresses
      };
    });

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
app.get('/proposition-intro', requireSession, (req, res) => {

  // Get the current proposition index (zero-based)
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant
  const propositionResponses = req.session.participantData.propositionResponses;

  // Check if all propositions are completed
  if (index >= propositionResponses.length) {
    // If all propositions are completed, move to LLM phase
    // Reset the LLM proposition index to 0 for starting LLM phase
    req.session.participantData.currentLLMPropositionIndex = 0;
    return res.redirect('/llm-stance');
  }

  // Select the current proposition
  const currentProposition = propositionResponses[index].proposition;

  res.render('proposition-intro', {
    proposition: currentProposition,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION INTRO - POST
app.post('/proposition-intro', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Proceed to the combined opinion screen
  res.redirect('/proposition-combined-opinion');
});

// PROPOSITION COMBINED OPINION
app.get('/proposition-combined-opinion', requireSession, (req, res) => {

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentProposition = propositionResponses[index].proposition;

  res.render('proposition-combined-opinion', {
    proposition: currentProposition,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION COMBINED OPINION - POST
app.post('/proposition-combined-opinion', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save all three data points from the combined form
  req.session.participantData.propositionResponses[index].writer_stance_pre = req.body.stancePre;
  req.session.participantData.propositionResponses[index].writer_bullets = req.body.bullets;
  req.session.participantData.propositionResponses[index].writer_paragraph = req.body.paragraph;

  // Proceed to the proposition affect grid screen
  res.redirect('/proposition-affect-grid');
});


// PROPOSITION AFFECT GRID
app.get('/proposition-affect-grid', requireSession, (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentProposition = propositionResponses[index].proposition;

  // Get the writer paragraph
  const writerParagraph = propositionResponses[index].writer_paragraph;

  res.render('proposition-affect-grid', {
    proposition: currentProposition,
    writerParagraph: writerParagraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION AFFECT GRID - POST
app.post('/proposition-affect-grid', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save affect grid data 
  req.session.participantData.propositionResponses[index].writer_affect_grid = {
    x: req.body.gridX,
    y: req.body.gridY
  };

  // Proceed to the proposition knowledge screen
  res.redirect('/proposition-knowledge');
});


// PROPOSITION KNOWLEDGE
app.get('/proposition-knowledge', requireSession, (req, res) => {

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentProposition = propositionResponses[index].proposition;

  // Get the writer paragraph
  const writerParagraph = propositionResponses[index].writer_paragraph;

  res.render('proposition-knowledge', {
    proposition: currentProposition,
    writerParagraph: writerParagraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION KNOWLEDGE - POST
app.post('/proposition-knowledge', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save knowledge rating 
  req.session.participantData.propositionResponses[index].writer_knowledge = req.body.knowledge;

  // Proceed to the proposition importance screen
  res.redirect('/proposition-importance');
});

// PROPOSITION IMPORTANCE
app.get('/proposition-importance', requireSession, (req, res) => {

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentProposition = propositionResponses[index].proposition;

  // Get the writer paragraph
  const writerParagraph = propositionResponses[index].writer_paragraph;

  res.render('proposition-importance', {
    proposition: currentProposition,
    writerParagraph: writerParagraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION IMPORTANCE - POST
app.post('/proposition-importance', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save importance rating
  req.session.participantData.propositionResponses[index].writer_importance = req.body.importance;

  // Proceed to the proposition stance confirmation screen
  res.redirect('/proposition-stance-confirmation');
});

// PROPOSITION STANCE CONFIRMATION
app.get('/proposition-stance-confirmation', requireSession, (req, res) => {

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentProposition = propositionResponses[index].proposition;

  // Get the writer paragraph
  const writerParagraph = propositionResponses[index].writer_paragraph;

  res.render('proposition-stance-confirmation', {
    proposition: currentProposition,
    writerParagraph: writerParagraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION STANCE CONFIRMATION - POST
app.post('/proposition-stance-confirmation', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save stance confirmation data
  req.session.participantData.propositionResponses[index].writer_stance_post = req.body.stancePost;

  // Proceed to the confidence screen
  res.redirect('/proposition-confidence');
});

// PROPOSITION CONFIDENCE
app.get('/proposition-confidence', requireSession, (req, res) => {

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentProposition = propositionResponses[index].proposition;

  // Get the writer paragraph
  const writerParagraph = propositionResponses[index].writer_paragraph;

  res.render('proposition-confidence', {
    proposition: currentProposition,
    writerParagraph: writerParagraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// PROPOSITION CONFIDENCE - POST
app.post('/proposition-confidence', (req, res) => {
  if (!req.session.participantData || !req.session.participantData.propositionResponses) {
    console.log("Missing session data, redirecting to root");
    return res.redirect('/');
  }

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save confidence rating
  req.session.participantData.propositionResponses[index].writer_confidence = req.body.confidence;

  // Increment the proposition index to move to the next proposition (since this is the final screen for the current proposition)
  req.session.participantData.currentWriterPropositionIndex++;

  // Return to the proposition intro screen to start the next proposition
  return res.redirect('/proposition-intro');
});

// PHASE 2: LLM RESPONSES

// LLM STANCE
app.get('/llm-stance', async (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Get the propositions assigned to the participant
  const propositionResponses = req.session.participantData.propositionResponses;

  console.log(`LLM proposition index: ${index}, Total responses: ${propositionResponses.length}`);

  // Check if all LLM responses are completed
  if (index >= propositionResponses.length) {
    console.log("All LLM responses completed, redirecting to final AI usage question");
    return res.redirect('/ai-usage');
  }

  // Select the current proposition response
  const currentResponse = propositionResponses[index];

  // Create a balanced assignment of conditions if not already created
  if (!req.session.participantData.modelAssignments) {
    console.log("Creating balanced assignment of models and sub-conditions");
    req.session.participantData.modelAssignments = createBalancedAssignment();
  }

  // Get assignment of conditions for current proposition
  const assignment = req.session.participantData.modelAssignments[index];

  // Assign model and input sub-condition based on balanced assignment
  if (!currentResponse.model_name) {
    currentResponse.model_name = assignment.model;
    console.log(`Assigned LLM for proposition ${index}: ${currentResponse.model_name}`);
  }

  if (!currentResponse.model_input_condition) {
    currentResponse.model_input_condition = assignment.subCondition;
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

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Save model stance data
  req.session.participantData.propositionResponses[index].model_paragraph_stance = req.body.modelStance;

  // Move to edit page
  res.redirect('/llm-edit');
});

// LLM EDIT
app.get('/llm-edit', requireSession, (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentResponse = propositionResponses[index];

  res.render('llm-edit', {
    proposition: currentResponse.proposition,
    modelParagraph: currentResponse.model_paragraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// LLM EDIT - POST
app.post('/llm-edit', (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Save the edited paragraph
  req.session.participantData.propositionResponses[index].edited_paragraph = req.body.editedParagraph;

  // Move to compare page
  res.redirect('/llm-compare');
});

// LLM COMPARE
app.get('/llm-compare', requireSession, (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentResponse = req.session.participantData.propositionResponses[index];

  res.render('llm-compare', {
    proposition: currentResponse.proposition,
    writerParagraph: currentResponse.writer_paragraph,
    editedParagraph: currentResponse.edited_paragraph,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length
  });
});

// SCREEN: LLM COMPARE - POST
app.post('/llm-compare', (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentResponse = req.session.participantData.propositionResponses[index];

  // Save comparison data
  currentResponse.writer_preference = req.body.preference;

  // Convert the preference reasons from form to array
  // The form sends a single value if only one checkbox is selected,
  // or an array if multiple checkboxes are selected
  let reasons = req.body.preferenceReason;
  if (reasons && !Array.isArray(reasons)) {
    reasons = [reasons];
  }

  currentResponse.writer_preference_reason = reasons || [];
  currentResponse.writer_preference_reason_other = req.body.reasonOther;

  // Redirect to final stance step
  res.redirect('/proposition-stance-final');
});


// PROPOSITION STANCE FINAL
app.get('/proposition-stance-final', requireSession, (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Get the propositions assigned to the participant and select the current one
  const propositionResponses = req.session.participantData.propositionResponses;
  const currentResponse = req.session.participantData.propositionResponses[index];

  res.render('proposition-stance-final', {
    proposition: currentResponse.proposition,
    index: index + 1, // Display 1-based index to the user
    total: propositionResponses.length,
  });
});

// PROPOSITION STANCE FINAL - POST
app.post('/proposition-stance-final', (req, res) => {

  // Get the current LLM proposition index
  const index = req.session.participantData.currentLLMPropositionIndex;

  // Save final stance data
  req.session.participantData.propositionResponses[index].writer_stance_final = req.body.stanceFinal;

  // Move to next proposition for LLM phase
  req.session.participantData.currentLLMPropositionIndex++;

  // Redirect back to first step for next proposition
  res.redirect('/llm-stance');
});

// AI USAGE
app.get('/ai-usage', requireSession, (req, res) => {
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

// COMPLETION
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

function getModels() {
  return [
    "anthropic/claude-3.7-sonnet",    // Claude 3.7 Sonnet by Anthropic
    "openai/gpt-4o-mini",             // GPT-4o-mini by OpenAI
    "deepseek/deepseek-chat-v3-0324", // DeepSeek-V3 by DeepSeek
  ];
}

// Function to get input sub-conditions
function getSubConditions() {
  return [
    "stance-based",  // LLM writes based on writer_stance
    "bullets-based", // LLM writes based on writer_bullets
    "rewrite-improve", // LLM writes based on writer_paragraph (rewrite or improve)
  ];
}

// Create a balanced assignment of models and sub-conditions
function createBalancedAssignment() {
  const models = getModels();
  const subConditions = getSubConditions();

  // Shuffle the models and sub-conditions arrays 
  const shuffledModels = [...models].sort(() => 0.5 - Math.random());
  const shuffledSubConditions = [...subConditions].sort(() => 0.5 - Math.random());

  // Create assignments for each proposition (3 total)
  const assignments = [];

  for (let i = 0; i < 3; i++) {
    // Determine if "rewrite-improve" should be "rewrite" or "improve"
    let finalSubCondition = shuffledSubConditions[i];
    if (finalSubCondition === "rewrite-improve") {
      // 50% chance for either "rewrite" or "improve"
      finalSubCondition = Math.random() < 0.5 ? "rewrite" : "improve";
    }

    assignments.push({
      model: shuffledModels[i],
      subCondition: finalSubCondition
    });
  }

  return assignments;
}

async function generateModelParagraph(proposition, stance, bullets, paragraph, model_input_condition, model_name) {
  // Construct the prompt based on the sub-condition
  let prompt = '';

  switch (model_input_condition) {
    case 'stance-based':
      prompt = `Consider the following political proposition: ${proposition}
On a scale from 0 to 100, where 0 is "strongly disagree", 50 is "ambivalent", and 100 is "strongly agree", my opinion on this proposition is ${stance}.
Please write a short paragraph of 100-150 words for me which explains my opinion.
Do not mention the numeric rating or include any preamble like "Based on the rating, ...".
Reply only with the paragraph, nothing else.`;
      break;

    case 'bullets-based':
      prompt = `Consider the following political proposition: ${proposition}
My opinion on this proposition is described by the following bullet points:
${bullets}
Please write a short paragraph of 100-150 words for me which explains my opinion.
Do not include any preamble, like "Based on the bullet points ...".
Reply only with the paragraph, nothing else.`;
      break;

    case 'rewrite':
      prompt = `Consider the following political proposition: ${proposition}
I wrote the following paragraph to explain my opinion on this proposition:
"${paragraph}"
Please rewrite this paragraph without changing its length.
Do not include any preamble, like "Based on the original paragraph ...".
Reply only with the rewritten paragraph, nothing else.`;
      break;

    case 'improve':
      prompt = `Consider the following political proposition: ${proposition}
I wrote the following paragraph to explain my opinion on this proposition:
"${paragraph}"
Please improve this paragraph without changing its length.
Do not include any preamble, like "Based on the original paragraph ...".
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
    console.error("S3 save failed, falling back to local storage:", error);
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
    throw error; // Rethrow to trigger fallback
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