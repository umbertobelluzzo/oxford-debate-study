// app.js - Main Express application file

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Custom packages
const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI API
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Load API key from .env
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'  // Add this
    }
  }));

// Sample propositions (to be filled with actual study propositions)
const propositions = [
  "The UK should implement a Universal Basic Income for all citizens.",
  "The UK should significantly increase its investment in renewable energy.",
  "The UK should require ID verification for all social media accounts.",
  "Immigration to the UK should be significantly reduced.",
  "The UK should rejoin the European Union.",
  // Add more propositions as needed
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
app.get('/dev', (req, res) => {
    // Initialize session with test data
    req.session.participantData = {
      prolificId: 'test-user',
      studyId: 'test-study',
      sessionId: 'test-session',
      currentStep: 'onboarding',
      demographics: {},
      propositionResponses: []
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
  
  // Randomly select 1 proposition
  const selectedPropositions = getRandomPropositions(propositions, 1);
  req.session.participantData.selectedPropositions = selectedPropositions;
  req.session.participantData.currentPropositionIndex = 0;
  
  res.redirect('/proposition');
});

// Proposition handling
app.get('/proposition', (req, res) => {

  if (!req.session.participantData || !req.session.participantData.selectedPropositions) {
    return res.redirect('/');
  }
  
  const index = req.session.participantData.currentPropositionIndex;
  const propositions = req.session.participantData.selectedPropositions;
  
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
    console.log("POST /proposition - Session:", req.session.participantData);
    console.log("Form data:", req.body);
    
    if (!req.session.participantData || !req.session.participantData.selectedPropositions) {
      console.log("Missing session data, redirecting to root");
      return res.redirect('/');
    }
    
    // Ensure propositionResponses array exists
    if (!req.session.participantData.propositionResponses) {
      req.session.participantData.propositionResponses = [];
    }
    
    const index = req.session.participantData.currentPropositionIndex;
    const currentProposition = req.session.participantData.selectedPropositions[index];
    
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
    
    // Save the session explicitly
    req.session.save(err => {
      if (err) {
        console.error("Error saving session:", err);
      }
      console.log("After update - Session:", req.session.participantData);
      res.redirect('/proposition');
    });
  });

app.get('/llm-response', async (req, res) => {
    // Add debugging
    console.log("GET /llm-response - Session:", req.session.participantData);
    
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
    const model_name = getRandomLLM();
    console.log(`Assigned LLM for proposition ${index}: ${model_name}`);
    
    // Randomly assign sub-condition for this proposition
    const subCondition = getRandomSubCondition();
    console.log(`Assigned sub-condition for proposition ${index}: ${subCondition}`);
    
    try {
      // Wait for the modelParagraph Promise to resolve
      const modelParagraph = await generateModelParagraph(
        currentResponse.proposition,
        currentResponse.writer_stance,
        currentResponse.writer_bullets,
        currentResponse.writer_paragraph,
        subCondition
      );
      
      res.render('llm-response', {
        proposition: currentResponse.proposition,
        modelParagraph: modelParagraph,
        writerParagraph: currentResponse.writer_paragraph,
        index: index + 1,
        total: propositionResponses.length
      });
    } catch (error) {
      console.error("Error generating model paragraph:", error);
      res.render('error', { message: 'Error generating AI response. Please try again.' });
    }
});


app.post('/llm-response', (req, res) => {
    // Add debugging
    console.log("POST /llm-response - Session data:", req.session.participantData);
    console.log("Form data:", req.body);
  
    // Fix the validation check - was checking incorrect condition
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
    response.model_name = req.body.modelName;
    response.model_paragraph = req.body.modelParagraph;
    response.model_paragraph_stance = req.body.modelStance;
    response.edited_paragraph = req.body.editedParagraph;
    response.writer_preference = req.body.preference;
    response.writer_preference_reason = req.body.preferenceReason;
    
    // Move to next proposition for LLM phase
    req.session.participantData.currentLLMPropositionIndex++;
    
    // Save data to database/file (simplified here with file storage)
    try {
      saveParticipantData(req.session.participantData);
      console.log("Data saved successfully");
    } catch (error) {
      console.error("Error saving data:", error);
    }
    
    // Explicitly save the session before redirecting
    req.session.save(err => {
      if (err) {
        console.error("Error saving session:", err);
      }
      console.log("After update - Session:", req.session.participantData);
      console.log(`Current LLM index: ${req.session.participantData.currentLLMPropositionIndex}, Total responses: ${req.session.participantData.propositionResponses.length}`);
      res.redirect('/llm-response');
    });
});

// Completion page
app.get('/completion', (req, res) => {
  if (!req.session.participantData) {
    return res.redirect('/');
  }
  
  // Generate completion code for Prolific
  const completionCode = generateCompletionCode();
  
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

function getRandomLLM() {
  const llms = [
    "GPT-4o", 
    "Claude-3.7-Sonnet", 
    "Llama-3.1-70B", 
    "Qwen-2.5-72B", 
    "DeepSeek-V3"
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
async function generateModelParagraph(proposition, stance, bullets, paragraph, subCondition) {
    // Construct the prompt based on the sub-condition
    let prompt = '';
    
    switch(subCondition) {
      case 'stance-based':
        prompt = `Consider the following political statement: ${proposition}
On a scale from 0 to 100, where 0 is "strongly disagree", 50 is "ambivalent", and 100 is "strongly agree", my opinion on this is ${stance}.
Please write a short paragraph of 100-200 words for me which explains my opinion.
Do not mention the numeric rating.
Reply only with the paragraph, nothing else.`;
        break;
        
      case 'bullets-based':
        prompt = `Consider the following political statement: ${proposition}
My opinion on this issue is described by the following bullet points:
${bullets}
Please write a short paragraph of 100-200 words for me which explains my opinion.
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
        throw new Error(`Unknown sub-condition ${subCondition}`);
    }

    // Get the currently assigned LLM model type - this needs to be accessed from the session
    // For now, we're using a fixed model since the llmType variable isn't defined
    const modelToUse = "gpt-4o-mini"; // Default fallback
    
    console.log("Generating paragraph with:", {
        modelToUse,
        subCondition,
        promptPreview: prompt
    });
    
    try {
      // Call the OpenAI API
      const completion = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
      
      // Extract the response
      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      throw error; // Re-throw to be handled by the caller
    }
}

function generateCompletionCode() {
  return 'OPINION' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function saveParticipantData(data) {
  // In production, this would save to a database
  // For development/demo, save to a local file
  const filename = `data/participant_${data.prolificId}_${Date.now()}.json`;
  const dir = path.dirname(filename);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

// Start server
app.listen(port, () => {
  console.log(`Study interface running on http://localhost:${port}/dev`);
});