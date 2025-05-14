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
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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
    id: "ai-regulation",
    title: "AI Development Should Be Heavily Regulated by Governments",
    description: "This debate examines whether AI development should be subject to extensive government oversight and regulation to ensure safety and ethical use.",
    resources: ["https://example.com/ai-regulation-info"]
  },
  {
    id: "universal-basic-income",
    title: "Universal Basic Income Should Be Implemented Globally",
    description: "This debate considers whether governments worldwide should provide all citizens with a regular stipend regardless of their income or employment status.",
    resources: ["https://example.com/ubi-info"]
  },
  {
    id: "social-media-harm",
    title: "Social Media Does More Harm Than Good to Society",
    description: "This debate explores whether social media platforms have a net negative impact on individuals and communities despite their benefits.",
    resources: ["https://example.com/social-media-research"]
  },
  {
    id: "climate-action-economy",
    title: "Aggressive Climate Action Will Harm Economic Growth",
    description: "This debate discusses whether ambitious policies to combat climate change will negatively impact economic development and prosperity.",
    resources: ["https://example.com/climate-economy"]
  },
  {
    id: "genetic-engineering",
    title: "Human Genetic Engineering Should Be Permitted for Non-Medical Purposes",
    description: "This debate examines the ethics of allowing genetic modification of humans for enhancement rather than just disease prevention.",
    resources: ["https://example.com/genetic-ethics"]
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
    demographics: {},
    debateResponses: [],
  };
  
  res.redirect('/setup');
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
app.post('/demographics', requireSession, (req, res) => {
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
  const topicId = req.body.topicId;
  const selectedTopic = debateTopics.find(topic => topic.id === topicId);
  
  if (!selectedTopic) {
    return res.render('error', { message: 'Invalid debate topic selected.' });
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
  const debate = req.session.debateData.debate;
  const currentTurnIndex = debate.currentTurn;
  const humanArgument = req.body.argument;
  const turnType = req.body.turnType;
  
  // Word count validation
  const wordCount = humanArgument.trim().split(/\s+/).length;
  if (wordCount < 100 || wordCount > 150) {
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
  debate.turns.push({
    side: debate.side,
    type: turnType,
    content: humanArgument,
    timestamp: new Date().toISOString(),
    isAI: false,
    wordCount: wordCount // Also store the word count for reference
  });
  
  // Increment turn counter
  debate.currentTurn++;
  
  // Check if debate is over - always using standard format (6 turns)
if (debate.currentTurn >= 6) {
  debate.status = 'completed';
  return res.redirect('/debate-results');
}
  
  // Save progress
  try {
    await saveDebateData(req.session.debateData);
  } catch (error) {
    console.error("Error saving debate data:", error);
  }
  
  // If not over, continue to next turn
  res.redirect('/debate-turn');
});

// DEBATE AI TURN
app.get('/debate-ai-turn', requireSession, async (req, res) => {
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
  
  try {
    // Generate AI's argument
    const aiArgument = await generateDebateArgument(
      debate.topic,
      aiSide,
      turnType,
      model,
      debate.turns
    );
    
    // Save AI's turn
    debate.turns.push({
      side: aiSide,
      type: turnType,
      content: aiArgument,
      timestamp: new Date().toISOString(),
      isAI: true,
      model: model.id
    });
    
    // Increment turn counter
    debate.currentTurn++;
    
    // Save progress
    try {
      await saveDebateData(req.session.debateData);
    } catch (error) {
      console.error("Error saving debate data:", error);
    }
    
    // Check if debate is over
    if (debate.currentTurn >= 6) {
      debate.status = 'completed';
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
    // Try to find the participant data in S3 or local storage
    // First try S3
    try {
      const params = {
        Bucket: bucketName,
        Prefix: `participants/${participantId}/`,
      };
      
      const result = await s3Client.send(new ListObjectsCommand(params));
      
      if (result.Contents && result.Contents.length > 0) {
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
      }
    } catch (s3Error) {
      console.error("S3 retrieval failed, trying local backup:", s3Error);
    }
    
    // Fallback to local file storage
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'data', 'participants');
    
    if (!fs.existsSync(dir)) {
      return null;
    }
    
    const files = fs.readdirSync(dir);
    const participantFiles = files.filter(file => file.startsWith(`participant_${participantId}_`));
    
    if (participantFiles.length === 0) {
      return null;
    }
    
    // Get the most recent file
    const latestFile = participantFiles.sort().pop();
    const filePath = path.join(dir, latestFile);
    const fileData = fs.readFileSync(filePath, 'utf8');
    
    return JSON.parse(fileData);
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
    const participantId = data.participantId;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Try to save to S3
    try {
      const key = `participants/${participantId}/participant_${timestamp}.json`;
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
      console.error("S3 save failed, falling back to local storage:", s3Error);
    }
    
    // Fallback to local file storage
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'data', 'participants');
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, `participant_${participantId}_${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    console.log(`Participant data saved locally to ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    console.error("Error saving participant data:", error);
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
  
  // Validate the participant ID (basic format check)
  if (!participantId || !participantId.startsWith('OXD-') || participantId.length !== 10) {
    return res.render('login', { error: 'Invalid participant ID format. Please check and try again.' });
  }
  
  // Try to load the participant data
  const participantData = await loadParticipantData(participantId);
  
  if (!participantData) {
    return res.render('login', { error: 'Participant ID not found. Please check and try again.' });
  }
  
  // Store the participant data in the session
  req.session.debateData = participantData;
  
  // Redirect to the dashboard
  res.redirect('/dashboard');
});

// Dashboard route to show progress
app.get('/dashboard', requireSession, (req, res) => {
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
  
  // Initialize completedDebates array if it doesn't exist
  if (!req.session.debateData.completedDebates) {
    req.session.debateData.completedDebates = [];
  }
  
  // Add current debate to completed list with metadata
  req.session.debateData.completedDebates.push({
    id: req.session.debateData.id,
    topic: debate.topic.id,
    side: debate.side,
    winnerSideValue: winnerSideValue,
    completedAt: new Date().toISOString()
  });
  
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
    
    // Prepare for next debate but keep completed debates history
    // Create a new debate ID while preserving the session
    req.session.debateData.id = 'debate-' + Date.now();
    req.session.debateData.startTimestamp = new Date().toISOString();
    
    // Remove current debate data to prepare for next one
    delete req.session.debateData.debate;
    
    // Redirect to dashboard
    return res.redirect('/dashboard');
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

    // Include only opening statements as context
    if (previousTurns && previousTurns.length > 0) {
      userPrompt += `\n\nPrevious arguments in this debate:\n\n`;
      
      // Filter to only include opening statements
      const openingStatements = previousTurns.filter(turn => turn.type === 'opening');
      
      openingStatements.forEach(turn => {
        userPrompt += `${turn.side.toUpperCase()} OPENING: ${turn.content}\n\n`;
      });
    }
  } 
  else if (turnType === 'closing') {
    // Closing statement prompt - include all previous turns
    userPrompt = `Summarize and close your case for the motion: "${topic.title}"

As the ${side.toUpperCase()} side, you should:
- Recap your strongest arguments
- Address the key points of contention
- Emphasize why your position is more compelling
- Leave a lasting impression

Keep your response between 100-150 words.`;

    // Include all previous arguments as context
    if (previousTurns && previousTurns.length > 0) {
      userPrompt += `\n\nPrevious arguments in this debate:\n\n`;
      
      previousTurns.forEach(turn => {
        const turnTypeUpper = turn.type.toUpperCase();
        userPrompt += `${turn.side.toUpperCase()} ${turnTypeUpper}: ${turn.content}\n\n`;
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
  
  try {
    // First try to save to S3
    const s3Result = await saveDebateDataToS3(data);
    return s3Result;
  } catch (error) {
    console.error("S3 save failed, falling back to local storage:", error);
    // Fallback to local file storage
    saveDebateDataToFile(data);
    return { success: false, error: error.message };
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
    'ai-regulation': 'technology',
    'universal-basic-income': 'economics',
    'social-media-harm': 'social',
    'climate-action-economy': 'environment',
    'genetic-engineering': 'ethics'
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
    const filename = `debate_${data.id}.json`;

    const params = {
      Bucket: bucketName,
      Key: `debates/${filename}`,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    };

    const result = await s3Client.send(new PutObjectCommand(params));
    console.log(`Data saved to S3: debates/${filename}`);
    return { success: true, key: `debates/${filename}` };
  } catch (error) {
    console.error('Error saving data to S3:', error);
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