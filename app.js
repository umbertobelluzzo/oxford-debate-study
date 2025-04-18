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
  [18, "The UK should impose economic sanctions on Israel in response to the 2023 invasion of Gaza."],
  [174, "The UK should implement strict regulation on the use of artificial intelligence technologies."],
  [387, "The UK should withdraw from the Paris Climate Agreement."],
  [339, "The UK should increase military support to Ukraine in response to the 2022 Russian invasion."],
  [20, "The UK should mandate COVID-19 vaccinations for all eligible citizens."],
  [68, "The UK should make abortion illegal."],
  [278, "The UK should transition to a socialist economic system, replacing capitalism."],
  [37, "The UK should legalise marijuana for recreational use."],
  [356, "The UK should abolish private schools and integrate them into the state education system."],
  [358, "The UK should defund the NHS."],
  [385, "The UK should transition to 100% renewable energy by 2030."],
  [389, "The UK should offer financial incentives to support carbon farming."],
  [85, "The UK should significantly reduce immigration levels."],
  [369, "The UK should implement a universal basic income for all citizens."],
  [201, "The UK should significantly increase its military spending."],
  [375, "The UK should introduce laws that limit the daily social media use of UK citizens."],
  [129, "The UK should legally recognize and protect all forms of transgender identity."],
  [242, "The UK should implement policies to ensure the protection and promotion of religious freedoms for Muslim communities."],
  [268, "The UK should increase its arsenal of nuclear weapons."],
  [184, "The UK should prioritize strengthening diplomatic ties with Commonwealth nations over forming new alliances with non-Commonwealth countries."],
  [126, "The UK should abolish existing gender pay equality legislation."],
  [61, "The UK should reintroduce the death penalty."],
  [47, "The UK should ban the consumption of meat."],
  [374, "The UK should implement policies to significantly reduce its economic dependence on other countries."],
  [325, "The UK should abolish voter ID requirements for parliament elections."],
  [333, "The UK should strengthen the rights and powers of labour unions."],
  [256, "The UK should increase funding and resources for the police force."],
  [22, "The UK should ban internet use for under-14-year-olds."],
  [81, "The UK should implement stricter regulations on the production and distribution of pornography."],
  [128, "The UK should implement mandatory gender diversity quotas for all publicly listed companies."],
  [364, "The UK should implement strict regulations on cryptocurrency transactions."],
  [186, "The UK should phase out the use of nuclear energy."],
  [40, "The UK should legalise euthanasia."],
  [308, "The UK should implement mandatory voting in all major elections."],
  [156, "The UK should defund Ofcom."],
  [345, "The UK should require employers to implement mandatory diversity and inclusion training for all employees."],
  [390, "The UK should implement a mandatory carbon emissions cap for all industries."],
  [180, "The UK should restrict the development of large language models."],
  [109, "The UK should make same-sex marriage illegal."],
  [370, "The UK should implement a comprehensive reform of its legal codes to ensure clarity and accessibility for all citizens."],
  [378, "The UK government should prioritize and accelerate digital transformation across all public services."],
  [248, "The UK should prioritize adherence to international law over national legislation in its foreign policy decisions."],
  [243, "The UK should decrease funding for its intelligence agencies."],
  [346, "The UK should implement stricter regulations to break up corporate monopolies."],
  [187, "The UK should adopt a policy of neutrality and non-intervention in all foreign wars."],
  [280, "The UK should privatise its prison system."],
  [371, "The UK should eliminate all EU regulations from its legal framework."],
  [25, "The UK should seek to rejoin the European Union."],
  [384, "The UK should mandate that all new cars sold be electric vehicles by 2030."],
  [67, "The UK should mandate companies to offer paid parental leave for all new parents."],
  [386, "The UK should implement a complete ban on single-use plastics."],
  [249, "The UK should formally apologize and provide reparations for the impacts of colonisation."],
  [41, "The UK should remove restrictions on genetic engineering."],
  [38, "The UK should loosen regulations on the import and distribution of international pharmaceuticals."],
  [12, "The UK should implement policies to limit the influence of woke culture in public institutions."],
  [176, "The UK should increase its military spending to strengthen its role within NATO."],
  [125, "The UK should ban the teaching of feminism in all schools."],
  [298, "The UK should ban the use of military drone technology."],
  [230, "The UK should protect employees from workplace dismissal due to social media backlash unrelated to their job performance."],
  [89, "The UK should implement policies to incentivise higher birth rates."],
  [372, "The UK should implement stricter regulations to limit urbanisation and protect rural areas."],
  [377, "The UK government should prioritize awarding contracts to domestic companies over international firms."],
  [94, "The UK should implement educational programs to promote understanding and respect for the role of women in Islam."],
  [357, "The UK should decrease funding for education for disabled students."],
  [360, "The UK should withdraw its commitments to the UN's Sustainable Development Goals."],
  [82, "The UK should fully decriminalise prostitution."],
  [236, "The UK should implement policies to actively discourage nationalism in all forms."],
  [353, "The UK should formally condemn China's political system as incompatible with democratic values."],
  [343, "The UK should defund the BBC."],
  [264, "The UK should sever all formal ties with the Catholic Church."],
  [303, "The UK should abolish the monarchy."],
  [393, "The UK should remove all regulations on environmental sustainability in supply chains."],
  [102, "The UK should allow transgender women to compete in women's sports."],
  [231, "The UK should always prioritise free speech over political correctness."],
  [261, "Scotland should become an independent country, separate from the United Kingdom."],
  [342, "The UK should implement stronger legal protections for free speech."],
  [173, "The UK should allow the use of autonomous vehicles on all public roads."],
  [51, "The UK should increase taxes on sugary drinks."],
  [122, "The UK should teach children about the LGBTQ+ community in primary school."],
  [250, "The UK should increase funding and resources for the Border Force."],
  [144, "The UK should commit to a policy of never using nuclear bombs under any circumstances."],
  [87, "The UK should mandate the implementation of ESG (Environmental, Social, and Governance) policies for all publicly traded companies."],
  [104, "The UK should ban the use of gender-inclusive language in all public sector communications."],
  [114, "The UK should mandate the inclusion of feminist perspectives in the national literature curriculum."],
  [368, "The UK should implement a 4-day workweek for all full-time employees."],
  [99, "The UK should increase financial incentives for couples to get married."],
  [392, "The UK should implement legally binding targets for protecting biodiversity."],
  [251, "The UK should mandate the teaching of creationism alongside evolution in all public schools."],
  [46, "The UK should implement stricter animal rights laws."],
  [171, "The UK should increase the state pension age."],
  [200, "The UK should raise taxes for oil companies."],
  [181, "The UK should implement strict regulations to prohibit students from using AI tools like ChatGPT for completing homework assignments."],
  [218, "The UK should significantly increase funding for space exploration."],
  [52, "The UK should legalise internet piracy."],
  [88, "The UK should significantly increase its foreign aid budget for combating global hunger."],
  [193, "The UK should make social justice a top policy priority."],
  [361, "The UK should mandate that all local councils implement comprehensive sustainability initiatives."],
  [54, "The UK should implement stricter regulations on the sale of violent video games to minors."],
  [344, "The UK should implement stricter regulations on social media platforms to combat the spread of fake news."],
  [221, "The UK should implement mandatory patriotism education in schools."],
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

    // Show No Consent code (set by Prolific)
    const noConsentCompletionCode = `CBI05CLJ`;

    // Render an error page 
    return res.render('error', {
      header: 'Consent Not Given',
      message: 'Thank you for considering our study. As you did not consent to participate, the survey will now end. Please enter the code below on Prolific to return your submission.',
      completionCode: noConsentCompletionCode
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
    req.session.participantData.propositionResponses = assignedPropositions.map(proposition => {
      return {
        propositionId: proposition[0], // Store the proposition ID
        proposition: proposition[1],   // Store the proposition text
        // Other fields will be added as the participant progresses
      };
    });

    // Continue to the first proposition
    return res.redirect('/proposition-intro');
  } else {
    // Failed the writing screener
    // Show partial completion code (set by Prolific)
    const partialCompletionCode = `CESVCPM6`;

    // Render an error page with partial compensation information
    return res.render('error', {
      header: 'Writing Screener Failed',
      message: 'Thank you for your participation. However, you failed our writing screener, so we are unable to proceed with your submission at this time. Please enter the code below on Prolific to receive partial compensation. Please allow for up to 3 working days for processing.',
      completionCode: partialCompletionCode
    });
  }
});

// PHASE 1: PROPOSITION RESPONSES

// PROPOSITION INTRO
app.get('/proposition-intro', requireSession, (req, res) => {

  // Get the current proposition index
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

  // Get the current proposition index
  const index = req.session.participantData.currentWriterPropositionIndex;

  // Save a timestamp for when the participant finished the introduction
  req.session.participantData.propositionResponses[index].finishedIntroTimestamp = new Date().toISOString();

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

  // Save the timestamp for when the participant finished the combined opinion
  req.session.participantData.propositionResponses[index].finishedCombinedOpinionTimestamp = new Date().toISOString();

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

  // Save the timestamp for when the participant finished the confidence screen
  req.session.participantData.propositionResponses[index].finishedPropositionRatingsTimestamp = new Date().toISOString();

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

  // Save the timestamp for when the participant finished the LLM stance
  req.session.participantData.propositionResponses[index].finishedLLMStanceTimestamp = new Date().toISOString();

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

  // Save the timestamp for when the participant finished the editing
  req.session.participantData.propositionResponses[index].finishedLLMEditTimestamp = new Date().toISOString();

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

  // Save the timestamp for when the participant finished the comparison
  req.session.participantData.propositionResponses[index].finishedLLMCompareTimestamp = new Date().toISOString();

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

  // Save the timestamp for when the participant finished the final stance
  req.session.participantData.propositionResponses[index].finishedFinalStanceTimestamp = new Date().toISOString();

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

  // Show completion code (set by Prolific)
  const completionCode = `CFJQVQVZ`;

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
    //"anthropic/claude-3.7-sonnet",    // Claude 3.7 Sonnet by Anthropic
    "openai/gpt-4o",             // GPT-4o by OpenAI
    //"deepseek/deepseek-chat-v3-0324", // DeepSeek-V3 by DeepSeek
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
      Key: `phase1/${filename}`,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    };

    const result = await s3Client.send(new PutObjectCommand(params));
    console.log(`Data saved to S3: phase1/${filename}`);
    return { success: true, key: `phase1/${filename}` };
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