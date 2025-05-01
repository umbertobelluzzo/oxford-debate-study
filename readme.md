# Oxford-Style Debate LLM Research Platform

This repository contains the web interface for a research study examining LLM participation in Oxford-style debates. The application facilitates structured debates between humans and AI language models, providing a framework for evaluating LLM capabilities in formal argumentation settings.

## Study Overview

This research investigates how large language models perform in structured Oxford-style debates by:
   1. Evaluating LLM adherence to formal debate structures
   2. Measuring persuasiveness of LLM arguments compared to human arguments
   3. Assessing how different LLM models perform in debate scenarios
   4. Examining how debate formats affect LLM-generated arguments

The study follows a multi-stage process:
   1. Debate Setup: Configuration of debate topics, format, and participating models
   2. Debate Execution: Structured exchange of arguments following Oxford debate rules
   3. Argument Analysis: Evaluation of debate performance and argument quality
## Project Structure
```
oxford-debate-platform/
├── app.js                       # Main application file
├── package.json                 # Dependencies and scripts
├── .env                         # Environment variables (create this file, not included in repo)
├── .gitignore                   # Git ignore configuration
├── public/                      # Static assets
│   ├── styles.css               # CSS styling
│   └── debate-utils.js          # JS utilities for debate interaction
├── views/                       # EJS templates
│   ├── index.ejs                # Landing page
│   ├── setup.ejs                # Debate configuration screen
│   ├── debate.ejs               # Main debate interface
│   ├── participant-view.ejs     # Interface for human participants
│   ├── moderator-view.ejs       # Interface for debate moderators
│   ├── audience-view.ejs        # Interface for audience/observers
│   ├── results.ejs              # Debate results and analysis
│   ├── admin.ejs                # Administrative controls
│   └── error.ejs                # Error handling
└── data/                        # Stored debate data (automatically created)
```

## Debate Flow

The application implements a standard Oxford-style debate format:

1. **Preparation Phase**:
- Selection of debate topic
- Assignment of teams (human, LLM, or mixed)
- Configuration of debate parameters (time limits, turn structure)

2. **Opening Statements**:
- Proposition team opening argument (6 minutes)
- Opposition team opening argument (6 minutes)

3. **Floor Speeches**:
- 2-4 additional speeches from each team (4 minutes each)

4. **Closing Statements**:
- Opposition team summary (4 minutes)
- Proposition team summary (4 minutes)

5. **Voting & Analysis**:
- Audience voting on debate winner
- Performance metrics and analysis

## LLM Integration
The platform integrates with multiple LLM providers through OpenRouter's API. Available models include:
- OpenAI (GPT-4o)
- Anthropic (Claude 3.5 Sonnet)
- Meta (Llama 3)
- Mistral (Mixtral)

Each model can be configured with different system prompts and debate preparation contexts:
- Standard Debater: Basic debate instructions
- Expert Debater: Enhanced with expert debating techniques
- Specialized Knowledge: Supplemented with domain-specific information
- Audience-Focused: Optimized for persuasive impact

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   NODE_ENV=development
   SESSION_SECRET=your-session-secret
   OPENROUTER_API_KEY=your-openrouter-api-key
   AWS_REGION=your-aws-region
   AWS_ACCESS_KEY_ID=your-aws-access-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   AWS_S3_BUCKET=your-s3-bucket
   ```

## Development

Run the application locally with:
```
npm run dev
```

This will start the application with nodemon, which automatically restarts the server when changes are detected.

For development testing without Prolific integration, access the application via:
```
http://localhost:3000/dev
```

## Data Storage

The platform stores debate data in structured JSON format:

1. **Primary**: AWS S3 bucket storage
2. **Fallback**: Local JSON files in the `data/` directory

Data is stored with the naming format:
```
debate_{TOPIC_ID}_{TIMESTAMP}.json
```

The structured data captures:

- Full debate transcripts
- Turn-by-turn arguments
- Timing metrics
- Audience voting results
- Performance analytics


## Heroku Deployment

### Prerequisites

1. [Create a Heroku account](https://signup.heroku.com/)
2. [Install Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)

### Deployment Steps

1. Log in to Heroku CLI:
   ```
   heroku login
   ```

2. Create a new Heroku app:
   ```
   heroku create oxford-debate-platform
   ```

3. Set environment variables on Heroku:
   ```
   heroku config:set NODE_ENV=production
   heroku config:set SESSION_SECRET=your-session-secret
   heroku config:set OPENROUTER_API_KEY=your-openrouter-api-key
   heroku config:set AWS_REGION=your-aws-region
   heroku config:set AWS_ACCESS_KEY_ID=your-aws-access-key
   heroku config:set AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   heroku config:set AWS_S3_BUCKET=your-s3-bucket
   ```

4. Deploy to Heroku:
   ```
   git push heroku main
   ```

## Customizing Debates

### Configuring Debate Topics

Edit the debateTopics array in app.js to modify available debate topics:

```javascript
const debateTopics = [
  {
    id: "ai-regulation",
    title: "AI Development Should Be Heavily Regulated by Governments",
    description: "This debate examines whether AI development should be subject to extensive government oversight and regulation to ensure safety and ethical use.",
    resources: ["URL to background information", "URL to key statistics"]
  },
  // Add more debate topics as needed
];
```

### Adjusting Debate Parameters
- Modify time limits, turn structures, and other debate parameters in the debateConfig object
- Customize LLM prompting strategies in the llmPromptTemplates section
- Adjust evaluation metrics through the evaluationCriteria configuration

## Security Features

- **Authentication**: Optional user authentication for debate participants and moderators
- **Session Management**: Express session middleware maintains state throughout debates
- **Error Handling**: Dedicated error management for various failure scenarios
- **Data Protection**: Secure storage of debate transcripts and analytics
