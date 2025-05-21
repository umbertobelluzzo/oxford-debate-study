// app.js - Main Express application file for Oxford-Style Debate Platform

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
const { OpenAI } = require('openai');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsCommand } = require('@aws-sdk/client-s3');

require('dotenv').config();

// Session configuration
sessionConfig = {
  secret: process.env.SESSION_SECRET || 'fallback-development-secret',
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
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
const bucketName = process.env.AWS_S3_BUCKET;

(async function validateS3Configuration() {
  try {
    // Test simple list operation to verify credentials and bucket access
    const testParams = {
      Bucket: bucketName,
      MaxKeys: 1
    };
    
    console.log("Testing S3 connection with:");
    console.log("- Region:", process.env.AWS_REGION);
    console.log("- Bucket:", bucketName);
    console.log("- Access Key ID exists:", !!process.env.AWS_ACCESS_KEY_ID);
    console.log("- Secret Access Key exists:", !!process.env.AWS_SECRET_ACCESS_KEY);
    
    const result = await s3Client.send(new ListObjectsCommand(testParams));
    console.log("✅ S3 connection test successful!");
    
  } catch (error) {
    console.error("❌ S3 CONNECTION TEST FAILED:");
    console.error("Error:", error.message);
    console.error("Error code:", error.code);
    
    if (error.code === 'NoSuchBucket') {
      console.error("The specified bucket does not exist:", bucketName);
      console.error("Please create the bucket or check the bucket name in your .env file.");
    } else if (error.code === 'AccessDenied') {
      console.error("Access denied to S3 bucket. Check your IAM permissions.");
      console.error("The IAM user needs permissions for s3:ListObjects, s3:PutObject, and s3:GetObject.");
    } else if (error.code === 'CredentialsError') {
      console.error("Invalid AWS credentials. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
    } else if (error.code === 'InvalidAccessKeyId') {
      console.error("Invalid AWS access key ID. Check your AWS_ACCESS_KEY_ID.");
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error("Signature does not match. Check your AWS_SECRET_ACCESS_KEY.");
    } else if (error.code === 'NetworkingError') {
      console.error("Network error. Check your internet connection and AWS_REGION setting.");
    }
    
    console.error("Falling back to local file storage for all operations.");
  }
})();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Middleware to require session
function requireSession(req, res, next) {
  if (!req.session.debateData) {
    return res.redirect('/');
  }
  next();
}

// Apply session middleware
app.use(session(sessionConfig));

// Define debate topics
const debateTopics = [
  {
    id: "facial-recognition",
    title: "This House Would Ban Facial Recognition Technology in All Public Spaces",
    description: "This debate examines whether facial recognition technology should be prohibited from use in public areas due to privacy, surveillance, and civil liberties concerns.",
  },
  {
    id: "single-use-plastics",
    title: "This House Would Ban Single‑Use Plastics Entirely",
    description: "This debate considers whether a complete ban on all single-use plastic products is necessary to address environmental pollution and sustainability challenges.",
  },
  {
    id: "remote-work",
    title: "This House Regrets the Rise of Remote Work",
    description: "This debate explores whether the widespread transition to remote work models has ultimately been detrimental to workplace culture, productivity, and social connections.",
  },
  {
    id: "dating-apps",
    title: "This House Regrets the Rise of Dating Apps",
    description: "This debate examines whether dating applications have negatively impacted human relationships, romantic connections, and social interactions.",
  },
  {
    id: "compulsory-voting",
    title: "This House Would Make Voting Compulsory",
    description: "This debate discusses whether mandatory voting should be implemented to increase civic participation and ensure more representative electoral outcomes.",
  },
  {
    id: "ai-art",
    title: "This House Regrets the Rise of AI-Generated Art",
    description: "This debate considers whether AI-generated art represents a positive evolution in creative expression or undermines human creativity and artistic value.",
  },
  {
    id: "nuclear-energy",
    title: "This House Believes Nuclear Energy Is Essential to Achieve Net Zero",
    description: "This debate examines whether nuclear power should play a central role in global strategies to reduce carbon emissions and combat climate change.",
  },
  {
    id: "four-day-workweek",
    title: "This House Would Mandate a Four‑Day Workweek",
    description: "This debate discusses whether a legally mandated four-day workweek would improve work-life balance, productivity, and overall well-being.",
  },
  {
    id: "reality-tv",
    title: "This House Regrets the Proliferation of Reality Television",
    description: "This debate explores whether the widespread popularity of reality TV programming has had a negative impact on media quality, cultural values, and social behavior.",
  },
  {
    id: "political-advertising",
    title: "This House Would Ban Targeted Political Advertising Online",
    description: "This debate examines whether microtargeted political ads on digital platforms should be prohibited to protect electoral integrity and reduce polarization.",
  }
];

// Define LLM models for debate
const debateModels = [
  {
    id: "llama3-1-405b",
    name: "Llama 3.1 405B Instruct",
    provider: "Meta",
    model: "meta-llama/llama-3.1-405b-instruct",
    maxTokens: 4000,
    temperature: 0.7
  }
];

// Define debate formats
const debateFormats = [
  {
    id: "standard",
    name: "Standard Oxford Style",
    description: "Traditional Oxford-style debate with opening statements, rebuttals, and closing statements.",
    turnSequence: ["opening", "opening", "rebuttal", "rebuttal", "closing", "closing"],
    turnCounts: 6,
    wordLimits: {
      opening: { min: 100, max: 150 },
      rebuttal: { min: 100, max: 150 },
      closing: { min: 100, max: 150 }
    }
  },
  {
    id: "modified",
    name: "Modified Oxford Style",
    description: "Condensed format with shorter speaking times and more interactive exchanges."
  },
  {
    id: "competitive",
    name: "Competitive Debate",
    description: "Focused on winning arguments with stricter time limits and scoring."
  }
];

// ===========================
// ROUTES
// ===========================

// Home page
app.get('/', (req, res) => {
  // If user already has a session, redirect to dashboard
  if (req.session && req.session.debateData) {
    return res.redirect('/dashboard');
  }
  
  // Otherwise show the login page
  res.render('login');
});

// If you still want to keep the index page accessible, 
// add a new route for it:
app.get('/index', (req, res) => {
  res.render('index', {
    debateTopics: debateTopics,
    debateModels: debateModels,
    debateFormats: debateFormats
  });
});

// Development mode route
app.get('/dev', async (req, res) => {
  // Initialize session with test data
  req.session.debateData = {
    id: 'test-debate-' + Date.now(),
    participantId: 'test-user',
    startTimestamp: new Date().toISOString(),
    demographics: {}, // Empty demographics object
    debateResponses: [],
  };
  
  // Redirect to demographics for development testing
  res.redirect('/demographics');
});

// CONSENT
app.get('/consent', (req, res) => {
  res.render('consent');
});

// CONSENT - POST
app.post('/consent', (req, res) => {
  const consentResponse = req.body.consent;

  // Initialize session
  req.session.debateData = {
    id: 'debate-' + Date.now(),
    participantId: req.body.participantId || 'anonymous-' + Date.now(),
    startTimestamp: new Date().toISOString(),
    demographics: {},
    consent: consentResponse,
  };

  // If user does not consent, show a thank you page and exit
  if (consentResponse === 'no') {
    return res.render('error', {
      header: 'Consent Not Given',
      message: 'Thank you for considering our study. As you did not consent to participate, the session will now end.'
    });
  }

  // Otherwise, continue to demographics
  res.redirect('/demographics');
});

// DEMOGRAPHICS
app.get('/demographics', requireSession, (req, res) => {
  res.render('demographics');
});

// DEMOGRAPHICS - POST
app.post('/demographics', requireSession, async (req, res) => {
  // Save demographics data
  req.session.debateData.demographics = {
    age: req.body.age,
    gender: req.body.gender,
    education: req.body.education,
    english: req.body.english,
    debateExperience: req.body.debateExperience,
    debateTraining: req.body.debateTraining,
    debateTrainingSpecify: req.body.debateTrainingSpecify,
    oxfordDebate: req.body.oxfordDebate,
    aiUsage: req.body.aiUsage,
    aiKnowledge: req.body.aiKnowledge
  };

  // Save the participant data to ensure demographics are persisted
  try {
    await saveParticipantData(req.session.debateData);
    console.log("Demographics data saved successfully");
  } catch (error) {
    console.error("Error saving demographics data:", error);
  }

  // Continue to setup
  res.redirect('/setup');
});

// SETUP
app.get('/setup', requireSession, (req, res) => {
  res.render('setup', {
    debateTopics: debateTopics,
    debateModels: debateModels,
    debateFormats: debateFormats
  });
});

// SETUP - POST
let globalPositionCounter = 0;

// Function to get position counts from the database or storage
async function getPositionCounts() {
  try {
    // In a production system, this would query your database
    // For now, use the global counter as a simple implementation
    return {
      proposition: Math.floor(globalPositionCounter / 2),
      opposition: Math.ceil(globalPositionCounter / 2)
    };
  } catch (error) {
    console.error("Error getting position counts:", error);
    return { proposition: 0, opposition: 0 };
  }
}

app.post('/setup', requireSession, async (req, res) => {
  // Always randomly assign a topic
  
  // Get list of completed topic IDs
  const completedTopics = req.session.debateData.completedDebates 
    ? req.session.debateData.completedDebates.map(d => d.topic) 
    : [];
  
  // Filter out topics they've already done
  const availableTopics = debateTopics.filter(topic => 
    !completedTopics.includes(topic.id));
  
  // If all topics have been used (unlikely with 10 topics and 5 debates), 
  // allow repeats but prefer least recently used
  let topicsToChooseFrom = availableTopics.length > 0 ? availableTopics : debateTopics;
  
  // Randomly select a topic from available ones
  const randomIndex = Math.floor(Math.random() * topicsToChooseFrom.length);
  const topicId = topicsToChooseFrom[randomIndex].id;
  
  const selectedTopic = debateTopics.find(topic => topic.id === topicId);
  
  if (!selectedTopic) {
    return res.render('error', { message: 'Error selecting debate topic. Please try again.' });
  }
  
  // If the participant already has a side assigned, use that
  // Otherwise, assign based on balancing
  let assignedSide;
  
  if (req.session.debateData.debate && req.session.debateData.debate.side) {
    // User is resuming - use their previously assigned side
    assignedSide = req.session.debateData.debate.side;
    console.log(`Continuing with previously assigned side: ${assignedSide}`);
  } else {
    // User needs a new assignment - balance positions
    const counts = await getPositionCounts();
    
    // Assign to the position with fewer assignments
    if (counts.proposition <= counts.opposition) {
      assignedSide = 'proposition';
    } else {
      assignedSide = 'opposition';
    }
    
    // Increment the counter to balance future assignments
    globalPositionCounter++;
    console.log(`Assigned new side: ${assignedSide} (Counts - Prop: ${counts.proposition}, Opp: ${counts.opposition})`);
  }
  
  // Always use the Llama 3.1 405B model
  const modelId = "llama3-1-405b";
  const selectedModel = debateModels.find(model => model.id === modelId);
  
  // Save debate configuration - always use 'standard' format
  req.session.debateData.debate = {
    topic: selectedTopic,
    format: 'standard', // Hard-coded to always use standard format
    side: assignedSide, // Programmatically assigned
    opponentModel: modelId,
    opponentModelDetails: selectedModel,
    startTime: new Date().toISOString(),
    turns: [],
    currentTurn: 0,
    status: 'setup'
  };
  
  // Save the data immediately to persist the assignments
  try {
    await saveDebateData(req.session.debateData);
  } catch (error) {
    console.error("Error saving initial debate configuration:", error);
  }
  
  // Continue to debate preparation
  res.redirect('/debate-prep');
});

// DEBATE PREPARATION
app.get('/debate-prep', requireSession, (req, res) => {
  const debate = req.session.debateData.debate;
  
  res.render('debate-prep', {
    topic: debate.topic,
    side: debate.side,
    format: debate.format,
    opponentModel: debateModels.find(model => model.id === debate.opponentModel)
  });
});

// DEBATE PREPARATION - POST
app.post('/debate-prep', requireSession, (req, res) => {
  const debate = req.session.debateData.debate;
  
  // Save preparation notes - just one field now
  debate.prepNotes = req.body.prepNotes;
  debate.prepComplete = true;
  
  // Initialize debate based on who goes first (proposition always goes first in Oxford style)
  if (debate.side === 'proposition') {
    // Human is proposition, so they go first
    res.redirect('/debate-turn');
  } else {
    // Human is opposition, so AI goes first - generate AI's opening statement
    generateAIOpening(req, res);
  }
});

// Generate AI's opening statement
async function generateAIOpening(req, res) {
  const debate = req.session.debateData.debate;
  const model = debateModels.find(m => m.id === debate.opponentModel);
  
  try {
    const aiOpeningStatement = await generateDebateArgument(
      debate.topic,
      'proposition', // AI is proposition if human is opposition
      'opening',
      model,
      [] // No previous turns yet
    );
    
    // Save AI's turn
    debate.turns.push({
      side: 'proposition',
      type: 'opening',
      content: aiOpeningStatement,
      timestamp: new Date().toISOString(),
      isAI: true,
      model: model.id
    });
    
    debate.currentTurn++;
    
    res.redirect('/debate-turn');
  } catch (error) {
    console.error("Error generating AI opening statement:", error);
    res.render('error', { message: 'Error generating AI response. Please try again.' });
  }
}

// DEBATE TURN
app.get('/debate-turn', requireSession, (req, res) => {
  const debate = req.session.debateData.debate;
  const currentTurnIndex = debate.currentTurn;
  const format = debateFormats.find(f => f.id === debate.format);
  
  // Determine turn type based on current turn index
let turnType;
let humanSide;
let aiSide;
let turnTitle; // Added variable for the properly formatted turn title

const isProposition = debate.side === 'proposition';

if (isProposition) {
  // Human is proposition
  humanSide = 'proposition';
  aiSide = 'opposition';
  
  if (currentTurnIndex === 0) {
    turnType = 'opening';
    turnTitle = 'Opening Statement';
  } else if (currentTurnIndex === debate.turns.length - 1) {
    turnType = 'closing';
    turnTitle = 'Closing Statement';
  } else {
    turnType = 'rebuttal';
    turnTitle = 'Rebuttal';
  }
} else {
  // Human is opposition
  humanSide = 'opposition';
  aiSide = 'proposition';
  
  if (currentTurnIndex === 1) {
    turnType = 'opening';
    turnTitle = 'Opening Statement';
  } else if (currentTurnIndex === debate.turns.length) {
    turnType = 'closing';
    turnTitle = 'Closing Statement';
  } else {
    turnType = 'rebuttal';
    turnTitle = 'Rebuttal';
  }
}

  // Check if it's the human's turn
  const isHumanTurn = (
    (isProposition && currentTurnIndex % 2 === 0) || // Proposition speaks on even turns
    (!isProposition && currentTurnIndex % 2 === 1)   // Opposition speaks on odd turns
  );
  
  if (isHumanTurn) {
    // It's the human's turn
    res.render('debate-human-turn', {
      debate: debate,
      turnType: turnType,
      turnTitle: turnTitle, // Add this
      turnIndex: currentTurnIndex,
      humanSide: humanSide,
      aiSide: aiSide,
      previousTurns: debate.turns
    });
  } else {
    // It's the AI's turn - generate response and then show it
    res.redirect('/debate-ai-turn');
  }
});

// DEBATE HUMAN TURN - POST
app.post('/debate-turn', requireSession, async (req, res) => {
  console.log("Processing human turn submission...");
  const debate = req.session.debateData.debate;
  const currentTurnIndex = debate.currentTurn;
  const humanArgument = req.body.argument;
  const turnType = req.body.turnType;
  
  // Word count validation
  const wordCount = humanArgument.trim().split(/\s+/).length;
  console.log(`Human ${turnType} - Word count: ${wordCount}`);
  
  if (wordCount < 100 || wordCount > 150) {
    console.log("Word count validation failed - returning error");
    return res.render('debate-human-turn', {
      debate: debate,
      turnType: turnType,
      turnIndex: currentTurnIndex,
      humanSide: debate.side,
      aiSide: debate.side === 'proposition' ? 'opposition' : 'proposition',
      previousTurns: debate.turns,
      error: `Your argument must be between 100-150 words. Current count: ${wordCount} words.`
    });
  }
  
  // Save human's turn
  const humanTurn = {
    side: debate.side,
    type: turnType,
    content: humanArgument,
    timestamp: new Date().toISOString(),
    isAI: false,
    wordCount: wordCount // Also store the word count for reference
  };

  console.log(`Adding human turn to debate: ${debate.side} ${turnType}`);
  debate.turns.push(humanTurn);
  
  // Increment turn counter
  debate.currentTurn++;
  
  // Check if debate is over - always using standard format (6 turns)
  if (debate.currentTurn >= 6) {
    debate.status = 'completed';
  
  // Save before redirecting
  try {
    console.log("Saving completed debate data...");
    await saveDebateData(req.session.debateData);
    console.log("Debate data saved successfully before redirect to results");
  } catch (error) {
    console.error("Error saving debate data:", error);
  }
  
  return res.redirect('/debate-results');
}

  // Save progress
  try {
    console.log("Saving human turn...");
    console.log(`Current turn data: ${JSON.stringify(humanTurn).substring(0, 100)}...`);
    console.log(`Total turns now: ${debate.turns.length}`);
    
    const saveResult = await saveDebateData(req.session.debateData);
    console.log("Human turn save result:", saveResult);
  } catch (error) {
    console.error("Error saving debate data after human turn:", error);
  }
  
  // If not over, continue to next turn
  res.redirect('/debate-turn');
});

// DEBATE AI TURN
app.get('/debate-ai-turn', requireSession, async (req, res) => {
  console.log("Processing AI turn...");
  const debate = req.session.debateData.debate;
  const currentTurnIndex = debate.currentTurn;
  const model = debateModels.find(m => m.id === debate.opponentModel);
  
  // Determine AI's turn type and side
  let turnType;
  let aiSide;
  
  if (debate.side === 'proposition') {
    // AI is opposition
    aiSide = 'opposition';
    
    if (currentTurnIndex === 1) {
      turnType = 'opening';
    } else if (currentTurnIndex === 5) {
      turnType = 'closing';
    } else {
      turnType = 'rebuttal';
    }
  } else {
    // AI is proposition
    aiSide = 'proposition';
    
    if (currentTurnIndex === 0) {
      turnType = 'opening';
    } else if (currentTurnIndex === 4) {
      turnType = 'closing';
    } else {
      turnType = 'rebuttal';
    }
  }
  
  console.log(`Generating AI ${turnType} for ${aiSide} side...`);
  console.log(`Current turn index: ${currentTurnIndex}`);
  console.log(`Previous turns: ${debate.turns.length}`);

  try {
    // Generate AI's argument
    const aiArgument = await generateDebateArgument(
      debate.topic,
      aiSide,
      turnType,
      model,
      debate.turns
    );
    
    console.log("AI argument generated successfully");
    
    // Save AI's turn
    const aiTurn = {
      side: aiSide,
      type: turnType,
      content: aiArgument,
      timestamp: new Date().toISOString(),
      isAI: true,
      model: model.id
    };
    
    console.log(`Adding AI turn to debate: ${aiSide} ${turnType}`);
    debate.turns.push(aiTurn);
    
    // Increment turn counter
    debate.currentTurn++;
    
    // Save progress
    try {
      console.log("Saving AI turn...");
      console.log(`Current turn data: ${JSON.stringify(aiTurn).substring(0, 100)}...`);
      console.log(`Total turns now: ${debate.turns.length}`);
      
      const saveResult = await saveDebateData(req.session.debateData);
      console.log("AI turn save result:", saveResult);
    } catch (error) {
      console.error("Error saving debate data after AI turn:", error);
    }
    
    // Check if debate is over
    if (debate.currentTurn >= 6) {
      debate.status = 'completed';
      console.log("Debate completed, redirecting to results");
      return res.redirect('/debate-results');
    }
    
    // Render AI's turn for the human to read
    res.render('debate-ai-turn', {
      debate: debate,
      aiArgument: aiArgument,
      turnType: turnType,
      aiSide: aiSide
    });
    
  } catch (error) {
    console.error("Error generating AI argument:", error);
    console.error(error.stack);
    res.render('error', { message: 'Error generating AI response. Please try again.' });
  }
});

// DEBATE AI TURN - POST (acknowledging the AI's turn)
app.post('/debate-ai-turn', requireSession, (req, res) => {
  // Continue to next turn
  res.redirect('/debate-turn');
});

// DEBATE RESULTS
app.get('/debate-results', requireSession, (req, res) => {
  const debate = req.session.debateData.debate;
  
  res.render('debate-results', {
    debate: debate
  });
});

// DEBATE RESULTS - POST (final ratings)
app.post('/debate-results', requireSession, async (req, res) => {
  const debate = req.session.debateData.debate;
  
  // Parse slider values as numbers
  const winnerSideValue = parseInt(req.body.winnerSide);
  const humanPerformanceValue = parseInt(req.body.humanPerformance);
  const aiPerformanceValue = parseInt(req.body.aiPerformance);
  const aiFactualAccuracyValue = parseInt(req.body.aiFactualAccuracy);
  
  // Interpret winner based on slider value
  let winnerSideInterpretation = "draw";
  if (winnerSideValue < 45) {
    winnerSideInterpretation = "human";
  } else if (winnerSideValue > 55) {
    winnerSideInterpretation = "ai";
  }
  
  // Save ratings and comments with continuous values
  debate.ratings = {
    // Continuous values (0-100)
    winnerSideValue: winnerSideValue,
    winnerSide: winnerSideInterpretation, // Interpreted categorical value for backward compatibility
    humanPerformance: humanPerformanceValue,
    aiPerformance: aiPerformanceValue,
    aiFactualAccuracy: aiFactualAccuracyValue,
    
    // Other feedback
    comments: req.body.comments,
    participateAgain: req.body.participateAgain === 'yes',
    
    // Timestamp for the ratings
    ratedAt: new Date().toISOString()
  };
  
  // Mark debate as complete
  debate.status = 'rated';
  debate.endTime = new Date().toISOString();
  
  // Add some analysis for easier data processing later
  debate.analysis = {
    performanceGap: humanPerformanceValue - aiPerformanceValue, // Positive means human performed better
    winnerMargin: Math.abs(50 - winnerSideValue), // How decisive was the win
    isHumanWin: winnerSideValue < 45,
    isAIWin: winnerSideValue > 55,
    isDraw: winnerSideValue >= 45 && winnerSideValue <= 55
  };
  
  // Save final debate data
  try {
    await saveDebateData(req.session.debateData);
    console.log("Debate data saved successfully");
  } catch (error) {
    console.error("Error saving final debate data:", error);
  }
  
  // Check nextAction to determine where to redirect
  const nextAction = req.body.nextAction;
  
  if (nextAction === 'continue') {
    // Continue to a new debate - keep the session but reset debate data
    // Save demographics and other user info
    const userInfo = {
      participantId: req.session.debateData.participantId,
      demographics: req.session.debateData.demographics,
      completedDebates: req.session.debateData.completedDebates || []
    };
    
    // Add current debate to completed list with some key metadata
    userInfo.completedDebates.push({
      id: req.session.debateData.id,
      topic: debate.topic.id,
      side: debate.side,
      winnerSideValue: winnerSideValue,
      completedAt: new Date().toISOString()
    });
    
    // Reset session but keep user info
    req.session.debateData = {
      id: 'debate-' + Date.now(),
      participantId: userInfo.participantId,
      demographics: userInfo.demographics,
      completedDebates: userInfo.completedDebates,
      startTimestamp: new Date().toISOString()
    };
    
    // Redirect to setup for new debate
    return res.redirect('/setup');
  } else {
    // Finish the session - go to completion page
    return res.redirect('/completion');
  }
});

// COMPLETION
app.get('/completion', requireSession, (req, res) => {
  // Generate a completion code for the participant
  const completionCode = generateCompletionCode();
  
  // Final completion page
  res.render('completion', {
    debate: req.session.debateData.debate,
    completionCode: completionCode
  });
  
  // Clear session after completion
  req.session.destroy();
});

// Function to generate a Prolific completion code
function generateCompletionCode() {
  return 'OXFORD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ===========================
// USER AUTHENTICATION & PROGRESS ROUTES
// ===========================

// Helper function to generate a unique participant ID
function generateParticipantId() {
  const prefix = 'OXD-';
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed potentially confusing characters like I, O, 0, 1
  let result = prefix;
  
  // Generate 6 random characters
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}

// Function to load participant data from storage
async function loadParticipantData(participantId) {
  try {
    console.log(`Attempting to load participant data for: ${participantId}`);
    
    // Try to find the participant data in S3 or local storage
    // First try S3
    try {
      const params = {
        Bucket: bucketName,
        Prefix: `participants/${participantId}/`,
      };
      
      console.log(`Searching S3 with prefix: participants/${participantId}/`);
      const result = await s3Client.send(new ListObjectsCommand(params));
      
      if (result.Contents && result.Contents.length > 0) {
        console.log(`Found ${result.Contents.length} files in S3 for this participant`);
        // Get the most recent file
        const latestObject = result.Contents.sort((a, b) => 
          new Date(b.LastModified) - new Date(a.LastModified))[0];
          
        const getParams = {
          Bucket: bucketName,
          Key: latestObject.Key,
        };
        
        const response = await s3Client.send(new GetObjectCommand(getParams));
        const dataString = await streamToString(response.Body);
        return JSON.parse(dataString);
      } else {
        console.log('No files found in S3 for this participant');
      }
    } catch (s3Error) {
      console.error("S3 retrieval failed, trying local backup:", s3Error);
    }
    
    // Fallback to local file storage
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'data', 'participants');
    
    if (!fs.existsSync(dir)) {
      console.log(`Local participant directory does not exist: ${dir}`);
    } else {
      const files = fs.readdirSync(dir);
      const participantFiles = files.filter(file => file.startsWith(`participant_${participantId}_`));
      
      if (participantFiles.length === 0) {
        console.log(`No local files found for participant: ${participantId}`);
      } else {
        console.log(`Found ${participantFiles.length} local files for this participant`);
        // Get the most recent file
        const latestFile = participantFiles.sort().pop();
        const filePath = path.join(dir, latestFile);
        const fileData = fs.readFileSync(filePath, 'utf8');
        
        return JSON.parse(fileData);
      }
    }
    
    // If we get here with no data found, but the ID is valid in the generated list, create new data
    console.log(`Checking if ID ${participantId} exists in generated list with ${generatedParticipantIds.length} entries`);
    const validId = generatedParticipantIds.find(id => id.code === participantId);
    
    if (validId) {
      console.log('ID exists in generated list but no data file found. Creating new participant data.');
      const newData = {
        id: 'debate-' + Date.now(),
        participantId: participantId,
        startTimestamp: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        demographics: {},
        completedDebates: [],
        consent: 'yes' // Pre-consent for testing purposes
      };
      
      // Save this data for future use
      try {
        await saveParticipantData(newData);
        console.log(`Created and saved new participant data for ${participantId}`);
      } catch (saveError) {
        console.error(`Error saving new participant data: ${saveError}`);
      }
      
      return newData;
    } else {
      console.log(`ID ${participantId} not found in generated IDs list`);
    }
    
    return null;
  } catch (error) {
    console.error("Error loading participant data:", error);
    return null;
  }
}
// Helper function to convert stream to string
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// Function to save participant data
async function saveParticipantData(data) {
  try {
    // Validate data before saving
    if (!data || !data.participantId) {
      throw new Error('Invalid participant data provided');
    }
    
    // Log data structure before saving
    console.log(`Saving participant data for ${data.participantId}. Completed debates: ${data.completedDebates ? data.completedDebates.length : 0}`);
    
    const participantId = data.participantId;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Try to save to S3
    try {
      const key = `participants/${participantId}/participant_${timestamp}.json`;
      
      // Log the data we're about to save
      console.log(`S3 save attempt: ${key}`);
      console.log(`Data structure: ${Object.keys(data).join(', ')}`);
      
      const params = {
        Bucket: bucketName,
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json'
      };
      
      await s3Client.send(new PutObjectCommand(params));
      console.log(`Participant data saved to S3: ${key}`);
      return { success: true, key };
    } catch (s3Error) {
      console.error("S3 save failed with error:", s3Error);
      throw s3Error; // Rethrow to trigger fallback
    }
  } catch (error) {
    console.error("Error in saveParticipantData:", error);
    // We should still try local fallback
    return saveParticipantDataToFile(data);
  }
}

// Add a local fallback function if it doesn't exist
function saveParticipantDataToFile(data) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'data', 'participants');
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const participantId = data.participantId || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `participant_${participantId}_${timestamp}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Participant data saved locally to ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    console.error("Error saving participant data to file:", error);
    return { success: false, error: error.message };
  }
}

// Modify the root route to show the login page
app.get('/', (req, res) => {
  res.render('login');
});

// Handle login attempts
app.post('/login', async (req, res) => {
  const participantId = req.body.participantId;
  
  // Validate the participant ID format
  if (!participantId || !participantId.startsWith('OXD-') || participantId.length !== 10) {
    return res.render('login', { error: 'Invalid participant ID format. Please check and try again.' });
  }
  
  // Ensure we have the latest generated IDs from S3
  await loadGeneratedIdsFromS3();
  
  // Check if ID exists in our generated IDs list
  const idEntry = generatedIdsFromS3.find(id => id.code === participantId);
  
  if (!idEntry) {
    return res.render('login', { error: 'Participant ID not found. Please check and try again.' });
  }
  
  // Try to load existing participant data
  const participantData = await loadParticipantData(participantId);
  
  if (participantData) {
    // Returning participant - use existing data
    req.session.debateData = participantData;
    
    // Mark the ID as used if not already
    if (!idEntry.used) {
      idEntry.used = true;
      await saveGeneratedIdsToS3();
    }
    
    // Update last active timestamp
    req.session.debateData.lastActive = new Date().toISOString();
    
    // Save the updated timestamp
    try {
      await saveParticipantData(req.session.debateData);
    } catch (error) {
      console.error("Error saving updated participant timestamp:", error);
    }
    
    // Check if demographics data exists and is not empty
    if (!req.session.debateData.demographics || 
        Object.keys(req.session.debateData.demographics).length === 0) {
      // No demographics data, redirect to demographics page
      return res.redirect('/demographics');
    }
    
    // Demographics data exists, redirect to dashboard
    res.redirect('/dashboard');
  } else {
    // First time using this ID - create new participant data
    
    // Mark the ID as used
    idEntry.used = true;
    await saveGeneratedIdsToS3();
    
    // Initialize session with new participant data
    req.session.debateData = {
      id: 'debate-' + Date.now(),
      participantId: participantId,
      startTimestamp: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      demographics: {}, // Empty demographics object
      completedDebates: [],
      consent: 'yes' // Auto-consent for pre-assigned IDs, modify if needed
    };
    
    // Save initial participant data
    try {
      await saveParticipantData(req.session.debateData);
    } catch (error) {
      console.error("Error saving new participant data:", error);
    }
    
    // For new participants, redirect to demographics first
    res.redirect('/demographics');
  }
});

// Dashboard route to show progress
app.get('/dashboard', requireSession, (req, res) => {
  // Check if demographics data exists and is not empty
  if (!req.session.debateData.demographics || 
      Object.keys(req.session.debateData.demographics).length === 0) {
    // No demographics data, redirect to demographics page
    return res.redirect('/demographics');
  }

  const user = {
    participantId: req.session.debateData.participantId,
    demographics: req.session.debateData.demographics || {}
  };
  
  // Get completed debates information
  const completedDebates = req.session.debateData.completedDebates || [];
  
  // Render the dashboard
  res.render('dashboard', {
    user,
    completedDebates,
    debateTopics
  });
});

// Exit route - when user wants to continue later
app.get('/exit', requireSession, (req, res) => {
  const participantId = req.session.debateData.participantId;
  const completedDebates = req.session.debateData.completedDebates || [];
  
  // Render the exit page
  res.render('exit', {
    participantId,
    completedDebates
  });
});

// Email participant ID route
app.post('/email-id', requireSession, async (req, res) => {
  const email = req.body.email;
  const participantId = req.session.debateData.participantId;
  
  // Email sending logic would go here
  // For now, just log it and return success
  console.log(`Would send participant ID ${participantId} to email: ${email}`);
  
  // If you have an email service set up, you would use it here
  // For example, with nodemailer:
  /*
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Oxford-Style Debate Research Participant ID',
    text: `Thank you for participating in our research study. Your participant ID is: ${participantId}\n\nPlease keep this ID safe so you can continue your participation later.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Oxford-Style Debate Research</h2>
        <p>Thank you for participating in our research study.</p>
        <p>Your participant ID is: <strong>${participantId}</strong></p>
        <p>Please keep this ID safe so you can continue your participation later.</p>
        <p>To resume your participation:</p>
        <ol>
          <li>Return to the study link</li>
          <li>Click "Returning Participant"</li>
          <li>Enter your Participant ID</li>
        </ol>
        <p>If you have any questions, please contact the researcher.</p>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
  */
  
  res.json({ success: true });
});

// Modify the consent POST route to generate and assign a participant ID
app.post('/consent', (req, res) => {
  const consentResponse = req.body.consent;

  // Generate a unique participant ID
  const participantId = generateParticipantId();

  // Initialize session
  req.session.debateData = {
    id: 'debate-' + Date.now(),
    participantId: participantId,
    startTimestamp: new Date().toISOString(),
    demographics: {},
    consent: consentResponse,
    completedDebates: [] // Initialize empty array for completed debates
  };

  // If user does not consent, show a thank you page and exit
  if (consentResponse === 'no') {
    return res.render('error', {
      header: 'Consent Not Given',
      message: 'Thank you for considering our study. As you did not consent to participate, the session will now end.'
    });
  }

  // Otherwise, continue to demographics
  res.redirect('/demographics');
});

// Modify the debate-results POST handler to update completedDebates
app.post('/debate-results', requireSession, async (req, res) => {
  const debate = req.session.debateData.debate;
  
  // Parse slider values as numbers
  const winnerSideValue = parseInt(req.body.winnerSide);
  const humanPerformanceValue = parseInt(req.body.humanPerformance);
  const aiPerformanceValue = parseInt(req.body.aiPerformance);
  const aiFactualAccuracyValue = parseInt(req.body.aiFactualAccuracy);
  
  // Interpret winner based on slider value
  let winnerSideInterpretation = "draw";
  if (winnerSideValue < 45) {
    winnerSideInterpretation = "human";
  } else if (winnerSideValue > 55) {
    winnerSideInterpretation = "ai";
  }
  
  // Save ratings and comments with continuous values
  debate.ratings = {
    // Continuous values (0-100)
    winnerSideValue: winnerSideValue,
    winnerSide: winnerSideInterpretation, // Interpreted categorical value for backward compatibility
    humanPerformance: humanPerformanceValue,
    aiPerformance: aiPerformanceValue,
    aiFactualAccuracy: aiFactualAccuracyValue,
    
    // Other feedback
    comments: req.body.comments,
    participateAgain: req.body.participateAgain === 'yes',
    
    // Timestamp for the ratings
    ratedAt: new Date().toISOString()
  };
  
  // Mark debate as complete
  debate.status = 'rated';
  debate.endTime = new Date().toISOString();
  
  // Add some analysis for easier data processing later
  debate.analysis = {
    performanceGap: humanPerformanceValue - aiPerformanceValue, // Positive means human performed better
    winnerMargin: Math.abs(50 - winnerSideValue), // How decisive was the win
    isHumanWin: winnerSideValue < 45,
    isAIWin: winnerSideValue > 55,
    isDraw: winnerSideValue >= 45 && winnerSideValue <= 55
  };
  
  // Ensure completedDebates exists and is an array
  if (!req.session.debateData.completedDebates) {
    console.log("Creating new completedDebates array");
    req.session.debateData.completedDebates = [];
  } else {
    console.log(`Found existing completedDebates array with ${req.session.debateData.completedDebates.length} items`);
  }
  
  // Create a deep copy of the debate metadata to avoid reference issues
  const debateMetadata = {
    id: req.session.debateData.id,
    topic: debate.topic.id,
    side: debate.side,
    winnerSideValue: winnerSideValue,
    completedAt: new Date().toISOString()
  };
  
  // Add to completed debates and log (just once!)
  req.session.debateData.completedDebates.push(debateMetadata);
  console.log(`Added debate to completedDebates. New count: ${req.session.debateData.completedDebates.length}`);
  
  // Save participant data (includes all completed debates)
  try {
    await saveParticipantData(req.session.debateData);
    console.log("Participant data saved successfully");
  } catch (error) {
    console.error("Error saving participant data:", error);
  }
  
  // Also save debate data separately (for debate-specific analysis)
  try {
    await saveDebateData(req.session.debateData);
    console.log("Debate data saved successfully");
  } catch (error) {
    console.error("Error saving final debate data:", error);
  }
  
  // Check nextAction to determine where to redirect
  const nextAction = req.body.nextAction;
  
  if (nextAction === 'continue') {
    // Check if user has completed all 5 debates
    if (req.session.debateData.completedDebates.length >= 5) {
      // All debates complete - redirect to final completion
      return res.redirect('/completion');
    }
    
    console.log("Continuing to next debate. Preserving session data...");
    console.log(`Current completed debates: ${req.session.debateData.completedDebates.length}`);
    
    // Store important user data
    const preservedData = {
      participantId: req.session.debateData.participantId,
      demographics: req.session.debateData.demographics,
      completedDebates: req.session.debateData.completedDebates || []
    };
    
    // Create a new debate ID but carefully update the session
    const oldDebateId = req.session.debateData.id;
    req.session.debateData.id = 'debate-' + Date.now();
    req.session.debateData.startTimestamp = new Date().toISOString();
    
    // Remove current debate data to prepare for next one
    delete req.session.debateData.debate;
    
    // Explicitly ensure completedDebates is preserved
    req.session.debateData.completedDebates = preservedData.completedDebates;
    req.session.debateData.demographics = preservedData.demographics;
    req.session.debateData.participantId = preservedData.participantId;
    
    console.log(`Updated session. Completed debates count: ${req.session.debateData.completedDebates.length}`);
    console.log(`Previous debate ID: ${oldDebateId}, New debate ID: ${req.session.debateData.id}`);
    
    // Force session save
    req.session.save(err => {
      if (err) {
        console.error("Error saving session:", err);
      }
      return res.redirect('/dashboard');
    });
  } else {
    // User wants to exit - go to exit page
    return res.redirect('/exit');
  }
});

// Update completion route to show certificate only after all debates
app.get('/completion', requireSession, (req, res) => {
  // Check if the user has completed 5 debates
  const completedDebates = req.session.debateData.completedDebates || [];
  
  if (completedDebates.length < 5) {
    // Not finished yet - redirect to dashboard
    return res.redirect('/dashboard');
  }
  
  // Generate a completion code for the participant
  const completionCode = generateCompletionCode();
  
  // Final completion page
  res.render('completion', {
    debate: req.session.debateData.debate,
    completionCode: completionCode,
    completedDebates: completedDebates
  });
  
  // Don't destroy the session yet in case they need to view their certificate again
});

// Add a final logout route that clears the session
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});


// New admin and participant ID routes for app.js
// Replace the localStorage/file-based functions with these S3-compatible versions

// Store generated participant IDs in memory and S3
let generatedParticipantIds = [];

// Admin access middleware with improved error handling
function requireAdmin(req, res, next) {
  // Check for token in query params (GET requests) or in request body (POST requests)
  const adminToken = req.query.token || req.body.token;
  const validToken = process.env.ADMIN_TOKEN || 'research-admin-access';
  
  console.log("Admin access attempt with token:", adminToken);
  
  if (!adminToken) {
    console.log("No token provided");
    return res.status(403).render('error', { 
      header: 'Access Denied', 
      message: 'No authentication token provided. Please include a valid token.'
    });
  }
  
  if (adminToken === validToken) {
    console.log("Token matched, granting access");
    next();
  } else {
    console.log("Token mismatch, denying access");
    res.status(403).render('error', { 
      header: 'Access Denied', 
      message: 'The provided authentication token is invalid.'
    });
  }
}

// Admin dashboard route
app.get('/admin', requireAdmin, async (req, res) => {
  // Load generated IDs from S3 first to ensure we have the latest data
  await loadGeneratedIdsFromS3();
  
  // Load participant data for the admin dashboard
  const participants = await loadAllParticipants();
  
  // Pass the token to the template
  const adminToken = req.query.token || process.env.ADMIN_TOKEN;
  
  res.render('admin', {
    generatedIds: generatedParticipantIds,
    participants: participants,
    token: adminToken // Pass the token to the template
  });
});

// Generate participant IDs route
app.post('/admin/generate-ids', requireAdmin, async (req, res) => {
  const count = parseInt(req.body.count) || 10;
  const newIds = [];
  
  for (let i = 0; i < count; i++) {
    const newId = generateParticipantId();
    newIds.push({
      code: newId,
      created: new Date().toISOString(),
      used: false
    });
  }
  
  // Add to existing IDs
  generatedParticipantIds = [...newIds, ...generatedParticipantIds];
  
  // Save IDs to S3 and local backup
  await saveGeneratedIdsToS3();
  
  res.render('admin', {
    generatedIds: generatedParticipantIds,
    participants: await loadAllParticipants() // Reload participants
  });
});

// Save generated IDs to S3
async function saveGeneratedIdsToS3() {
  try {
    // Save to S3
    const key = 'admin/generated_participant_ids.json';
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(generatedParticipantIds, null, 2),
      ContentType: 'application/json'
    };
    
    await s3Client.send(new PutObjectCommand(params));
    console.log(`Saved ${generatedParticipantIds.length} generated IDs to S3: ${key}`);
    
    // Also save locally as backup
    saveGeneratedIdsToFile();
    
    return { success: true };
  } catch (error) {
    console.error("Error saving generated participant IDs to S3:", error);
    // Fall back to local file storage
    return saveGeneratedIdsToFile();
  }
}

// Local file backup for generated IDs
function saveGeneratedIdsToFile() {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'data');
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, 'generated_participant_ids.json');
    fs.writeFileSync(filePath, JSON.stringify(generatedParticipantIds, null, 2));
    
    console.log(`Backup: Saved ${generatedParticipantIds.length} generated IDs to ${filePath}`);
    return { success: true };
  } catch (error) {
    console.error("Error saving generated participant IDs to file:", error);
    return { success: false, error: error.message };
  }
}

// Load generated IDs from S3
async function loadGeneratedIdsFromS3() {
  try {
    // Try to load from S3
    const key = 'admin/generated_participant_ids.json';
    const params = {
      Bucket: bucketName,
      Key: key
    };
    
    try {
      const response = await s3Client.send(new GetObjectCommand(params));
      const dataString = await streamToString(response.Body);
      generatedParticipantIds = JSON.parse(dataString);
      console.log(`Loaded ${generatedParticipantIds.length} generated participant IDs from S3`);
      return true;
    } catch (s3Error) {
      console.error("S3 retrieval failed, trying local backup:", s3Error);
      // Fall back to local file
      return loadGeneratedIdsFromFile();
    }
  } catch (error) {
    console.error("Error loading generated participant IDs:", error);
    generatedParticipantIds = [];
    return false;
  }
}

// Load from local file as backup
function loadGeneratedIdsFromFile() {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, 'data', 'generated_participant_ids.json');
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      generatedParticipantIds = JSON.parse(data);
      console.log(`Loaded ${generatedParticipantIds.length} generated participant IDs from local backup`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error loading generated participant IDs from file:", error);
    generatedParticipantIds = [];
    return false;
  }
}

// Load all participants for admin dashboard
async function loadAllParticipants() {
  const participants = [];
  
  try {
    // Try to list all participant files from S3
    const params = {
      Bucket: bucketName,
      Prefix: 'participants/'
    };
    
    try {
      const result = await s3Client.send(new ListObjectsCommand(params));
      
      if (result.Contents && result.Contents.length > 0) {
        // Group files by participant ID
        const participantFiles = {};
        
        for (const object of result.Contents) {
          const key = object.Key;
          // Extract participant ID from key (format: participants/OXD-123456/...)
          const match = key.match(/participants\/(OXD-[A-Z0-9]+)/);
          
          if (match && match[1]) {
            const participantId = match[1];
            if (!participantFiles[participantId]) {
              participantFiles[participantId] = [];
            }
            participantFiles[participantId].push({
              key,
              lastModified: object.LastModified
            });
          }
        }
        
        // Get latest file for each participant
        for (const [participantId, files] of Object.entries(participantFiles)) {
          // Sort by lastModified date (newest first)
          files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
          
          // Get participant data from the most recent file
          if (files.length > 0) {
            const getParams = {
              Bucket: bucketName,
              Key: files[0].key
            };
            
            try {
              const response = await s3Client.send(new GetObjectCommand(getParams));
              const dataString = await streamToString(response.Body);
              const participantData = JSON.parse(dataString);
              
              // Add to participants list with summary information
              participants.push({
                id: participantId,
                completedDebates: participantData.completedDebates || [],
                lastActive: participantData.lastActive || files[0].lastModified,
                status: getParticipantStatus(participantData)
              });
            } catch (error) {
              console.error(`Error retrieving participant data for ${participantId}:`, error);
            }
          }
        }
      }
    } catch (s3Error) {
      console.error("S3 listing failed, trying local backup:", s3Error);
      // You could add local file fallback here if needed
    }
    
    return participants;
  } catch (error) {
    console.error("Error loading participants:", error);
    return [];
  }
}

// Determine participant status based on their data
function getParticipantStatus(participantData) {
  if (!participantData) return 'new';
  
  const completedDebates = participantData.completedDebates || [];
  
  if (completedDebates.length >= 5) {
    return 'completed';
  } else if (completedDebates.length > 0 || participantData.lastActive) {
    return 'active';
  } else {
    return 'new';
  }
}

// Load on application startup
loadGeneratedIdsFromS3();

// Modified login POST route to check against generated IDs
app.post('/login', async (req, res) => {
  const participantId = req.body.participantId;
  
  // Validate the participant ID format
  if (!participantId || !participantId.startsWith('OXD-') || participantId.length !== 10) {
    return res.render('login', { error: 'Invalid participant ID format. Please check and try again.' });
  }
  
  // Ensure we have the latest generated IDs from S3
  await loadGeneratedIdsFromS3();
  
  // Check if ID exists in our generated IDs list
  const idEntry = generatedParticipantIds.find(id => id.code === participantId);
  
  if (!idEntry) {
    return res.render('login', { error: 'Participant ID not found. Please check and try again.' });
  }
  
  // Try to load existing participant data
  const participantData = await loadParticipantData(participantId);
  
  if (participantData) {
    // Returning participant - use existing data
    req.session.debateData = participantData;
    
    // Mark the ID as used if not already
    if (!idEntry.used) {
      idEntry.used = true;
      await saveGeneratedIdsToS3();
    }
    
    // Update last active timestamp
    req.session.debateData.lastActive = new Date().toISOString();
    
    // Save the updated timestamp
    try {
      await saveParticipantData(req.session.debateData);
    } catch (error) {
      console.error("Error saving updated participant timestamp:", error);
    }
    
    // Redirect to dashboard
    res.redirect('/dashboard');
  } else {
    // First time using this ID - create new participant data
    
    // Mark the ID as used
    idEntry.used = true;
    await saveGeneratedIdsToS3();
    
    // Initialize session with new participant data
    req.session.debateData = {
      id: 'debate-' + Date.now(),
      participantId: participantId,
      startTimestamp: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      demographics: {},
      completedDebates: [],
      consent: 'yes' // Auto-consent for pre-assigned IDs, modify if needed
    };
    
    // Save initial participant data
    try {
      await saveParticipantData(req.session.debateData);
    } catch (error) {
      console.error("Error saving new participant data:", error);
    }
    
    // For new participants, redirect to demographics first
    res.redirect('/demographics');
  }
});

// ===========================
// HELPER FUNCTIONS
// ===========================

// Generate LLM debate arguments
async function generateDebateArgument(topic, side, turnType, modelConfig, previousTurns) {
  // Base system prompt that's consistent for all turn types
  let systemPrompt = `You are an expert debater participating in an Oxford-style debate.
You are on the ${side === 'proposition' ? 'PROPOSITION' : 'OPPOSITION'} side, which means you ${side === 'proposition' ? 'SUPPORT' : 'OPPOSE'} the motion: "${topic.title}".

Follow these guidelines:
1. Make compelling, logical arguments supported by evidence
2. Address counterarguments raised by the other side when relevant
3. Use formal debate language and structure
4. Be persuasive but fair in your representation of facts
5. For Oxford-style debates, focus on clarity, reasoning, and persuasion
6. IMPORTANT: Your response MUST be between 100-150 words ONLY`;

  // Specialized prompts for each turn type
  let userPrompt = '';
  
  if (turnType === 'opening') {
    // Opening statement prompt - no previous context needed
    userPrompt = `Write your opening statement for the motion: "${topic.title}"

As the ${side.toUpperCase()} side, you should:
- Clearly state your position 
- Present 2-3 key arguments
- Establish a strong foundation for your case

Keep your response between 100-150 words.`;
  } 
  else if (turnType === 'rebuttal') {
    // Rebuttal prompt - include opening statements
    userPrompt = `Respond to your opponent's opening statement and strengthen your own case.

As the ${side.toUpperCase()} side, you should:
- Address the key points raised by your opponent
- Defend your position against their criticisms
- Reinforce your strongest arguments
- Identify weaknesses in their reasoning

Keep your response between 100-150 words.`;

    // Include only relevant previous arguments
    if (previousTurns && previousTurns.length > 0) {
      userPrompt += `\n\nPrevious arguments in this debate:\n\n`;
      
      // Include all arguments up to this point to provide better context
      const relevantTurns = previousTurns.filter(turn => turn.type === 'opening' || turn.type === 'rebuttal');
      
      relevantTurns.forEach(turn => {
        const turnSide = turn.side.toUpperCase();
        const turnType = turn.type.toUpperCase();
        userPrompt += `${turnSide} ${turnType}: ${turn.content}\n\n`;
      });
    }
  } 
  else if (turnType === 'closing') {
    // Enhanced closing statement prompt - include ALL previous turns for comprehensive context
    userPrompt = `Summarize and close your case for the motion: "${topic.title}"

As the ${side.toUpperCase()} side, you should:
- Recap your strongest arguments throughout the debate
- Address ALL key points of contention raised by your opponent
- Specifically respond to your opponent's most recent arguments
- Emphasize why your position is more compelling overall
- Provide a coherent, persuasive final summary of your case

Keep your response between 100-150 words.`;

    // Include ALL previous arguments to provide complete context for closing
    if (previousTurns && previousTurns.length > 0) {
      userPrompt += `\n\nAll previous arguments in this debate (in chronological order):\n\n`;
      
      previousTurns.forEach(turn => {
        const turnSide = turn.side.toUpperCase();
        const turnType = turn.type.toUpperCase();
        const participant = turn.isAI ? "AI" : "HUMAN";
        userPrompt += `${turnSide} ${turnType} (${participant}): ${turn.content}\n\n`;
      });
    }
  }
  
  // Final instructions to ensure proper output
  userPrompt += `\nYour ${turnType} statement must be between 100-150 words. Do not mention that you are an AI.`;

  try {
    // Call the OpenRouter API with the selected model
    const completion = await openrouter_client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
    });

    // Extract the response from the completion
    let response = completion.choices[0].message.content.trim();
    
    // Check word count and truncate if necessary
    const wordCount = response.split(/\s+/).length;
    
    if (wordCount > 150) {
      console.log(`AI response too long (${wordCount} words), truncating to 150 words...`);
      // Simple truncation approach - could be improved
      response = response.split(/\s+/).slice(0, 150).join(' ');
    } else if (wordCount < 100) {
      console.log(`AI response too short (${wordCount} words), but proceeding anyway.`);
      // You could implement additional handling for too-short responses
    }
    
    return response;
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    throw error; // Re-throw to be handled by the caller
  }
}

// Save debate data to storage
async function saveDebateData(data) {
  
  let dataToSave;
  try {
    dataToSave = JSON.parse(JSON.stringify(data));
  } catch (error) {
    console.error("Error cloning debate data:", error);
    console.error("Attempting to continue with original data");
    dataToSave = data;
  }
  
  console.log(`Saving debate data. Current turn: ${dataToSave.debate?.currentTurn}, Turns count: ${dataToSave.debate?.turns?.length}`);
  
  // Add metadata to help with Phase 2
  if (!data.metadata) {
    data.metadata = {
      debatePhase: 'Phase 1',
      topicCategory: getCategoryForTopic(data.debate.topic.id),
      modelVersion: "Meta/Llama-3-1-405B/May2025", // Fixed model version
      participantPosition: data.debate.side, // Store assigned position
      argumentCount: data.debate.turns.length,
      totalWordCountHuman: data.debate.turns
        .filter(turn => !turn.isAI)
        .reduce((total, turn) => {
          const count = turn.wordCount || (turn.content ? turn.content.split(/\s+/).length : 0);
          return total + count;
        }, 0),
      totalWordCountAI: data.debate.turns
        .filter(turn => turn.isAI)
        .reduce((total, turn) => {
          const count = turn.wordCount || (turn.content ? turn.content.split(/\s+/).length : 0);
          return total + count;
        }, 0),
      assignmentTimestamp: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };
  } else {
    // Update existing metadata
    data.metadata.argumentCount = data.debate.turns.length;
    data.metadata.totalWordCountHuman = data.debate.turns
      .filter(turn => !turn.isAI)
      .reduce((total, turn) => {
        const count = turn.wordCount || (turn.content ? turn.content.split(/\s+/).length : 0);
        return total + count;
      }, 0);
    data.metadata.totalWordCountAI = data.debate.turns
      .filter(turn => turn.isAI)
      .reduce((total, turn) => {
        const count = turn.wordCount || (turn.content ? turn.content.split(/\s+/).length : 0);
        return total + count;
      }, 0);
    data.metadata.timestamp = new Date().toISOString();
    
    // Ensure position is always stored (in case it's an older record)
    if (!data.metadata.participantPosition && data.debate.side) {
      data.metadata.participantPosition = data.debate.side;
    }
  }

  // Log key data before saving
  if (dataToSave.debate && dataToSave.debate.turns) {
    console.log(`Turn data to save: ${dataToSave.debate.turns.length} turns`);
    dataToSave.debate.turns.forEach((turn, index) => {
      console.log(`Turn ${index}: ${turn.side} (${turn.isAI ? 'AI' : 'Human'}) - ${turn.type} - ${turn.content.substring(0, 30)}...`);
    });
  }
  
  try {
    // First try to save to S3
    console.log("Attempting to save to S3...");
    const s3Result = await saveDebateDataToS3(dataToSave);
    console.log("S3 save successful:", s3Result);
    return s3Result;
  } catch (error) {
    console.error("S3 save failed with error:", error);
    console.error("Error code:", error.code);
    console.error("Error stack:", error.stack);
    
    // Fallback to local file storage
    console.log("Falling back to local file storage");
    const localResult = saveDebateDataToFile(dataToSave);
    console.log("Local save result:", localResult);
    return { success: false, error: error.message, localResult };
  }
}

// Update the getModelVersion function since we're no longer using it
// (keep for backward compatibility)
function getModelVersion(modelId) {
  // Now always return the Llama 3.1 version
  return "Meta/Llama-3-1-405B/May2025";
}

// Helper functions for metadata
function getCategoryForTopic(topicId) {
  // Map topics to broader categories for later analysis
  const categoryMap = {
    'facial-recognition': 'technology',
    'single-use-plastics': 'environment',
    'remote-work': 'social',
    'dating-apps': 'social',
    'compulsory-voting': 'politics',
    'ai-art': 'technology',
    'nuclear-energy': 'environment',
    'four-day-workweek': 'economics',
    'reality-tv': 'media',
    'political-advertising': 'politics'
  };
  return categoryMap[topicId] || 'general';
}

function getModelVersion(modelId) {
  // This could be useful for tracking model versions over time
  const versionMap = {
    'gpt4o': 'OpenAI/GPT-4o/May2024',
    'claude': 'Anthropic/Claude-3-5-Sonnet/April2024',
    'llama': 'Meta/Llama-3-70b/March2024'
  };
  return versionMap[modelId] || modelId;
}

// Function to save debate data to S3
async function saveDebateDataToS3(data) {
  try {
    // Create a unique filename with timestamp to prevent overwrites
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `debate_${data.id}_${timestamp}.json`;

    console.log(`Saving debate data to S3 bucket '${bucketName}' with key 'debates/${filename}'`);
    
    const params = {
      Bucket: bucketName,
      Key: `debates/${filename}`,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    };

    const result = await s3Client.send(new PutObjectCommand(params));
    console.log(`Data saved to S3: debates/${filename}`);
    console.log(`S3 result: ${JSON.stringify(result.$metadata)}`);
    
    return { success: true, key: `debates/${filename}` };
  } catch (error) {
    console.error('Error saving data to S3:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'NetworkingError') {
      console.error('Network error - check your internet connection');
    } else if (error.code === 'NoSuchBucket') {
      console.error(`The bucket '${bucketName}' does not exist`);
    } else if (error.code === 'AccessDenied') {
      console.error(`Access denied to bucket '${bucketName}'`);
    }
    
    throw error; // Rethrow to trigger fallback
  }
}

// Keep your existing file storage function as a backup
function saveDebateDataToFile(data) {
  const filename = `data/debate_${data.id}_${Date.now()}.json`;
  const dir = path.dirname(filename);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`Debate data saved locally to ${filename} (S3 backup)`);
}

// Anonymize debate data for storage
function anonymizeDebateData(data) {
  // Create a deep copy to avoid modifying the original
  const anonymizedData = JSON.parse(JSON.stringify(data));
  
  // Generate a hashed version of participant ID
  const crypto = require('crypto');
  const salt = process.env.HASH_SALT || 'oxford-debate-salt';
  
  if (anonymizedData.participantId) {
    anonymizedData.participantIdHash = crypto
      .createHash('sha256')
      .update(anonymizedData.participantId + salt)
      .digest('hex');
    // Remove original ID
    delete anonymizedData.participantId;
  }
  
  // Anonymize demographics data
  if (anonymizedData.demographics) {
    // Convert exact age to age range
    if (anonymizedData.demographics.age) {
      const age = parseInt(anonymizedData.demographics.age);
      anonymizedData.demographics.ageRange = getAgeRange(age);
      delete anonymizedData.demographics.age;
    }
    
    // We can keep gender, education, debateExperience, aiKnowledge, and politicalOrientation
    // as they are less directly identifying
  }
  
  // Add anonymization metadata
  anonymizedData.anonymizationInfo = {
    anonymizedAt: new Date().toISOString(),
    version: '1.0',
    method: 'basic-pii-removal'
  };
  
  return anonymizedData;
}

// Helper function to convert exact age to age range
function getAgeRange(age) {
  if (age < 18) return 'under 18';
  else if (age < 25) return '18-24';
  else if (age < 35) return '25-34';
  else if (age < 45) return '35-44';
  else if (age < 55) return '45-54';
  else if (age < 65) return '55-64';
  else return '65+';
}



// Start server
app.listen(port, () => {
  console.log(`Oxford Debate Platform running on http://localhost:${port}`);
  console.log(`For development testing, use http://localhost:${port}/dev`);
});