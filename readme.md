# LLM Opinion Distortion Study - Phase 1 Interface

This repository contains the web interface for Phase 1 (Writing) of the "Quantifying the Distortive Impacts of LLM Writing Assistance for Opinion Expression" study. The application facilitates collecting opinions on political topics and interactions with LLM-generated content, with integration for Prolific participant recruitment.

## Study Overview

This study examines whether the use of LLMs for writing assistance systematically distorts how others perceive:
1. LLM users themselves
2. The opinions they express

The complete study is conducted in two phases:

1. **Phase 1 (Writing)**: Participants (writers) express opinions on political topics and then interact with LLM-generated content based on their inputs.
2. **Phase 2 (Rating)**: A separate group of participants (raters) evaluate the content produced in Phase 1.

This repository implements only the interface for Phase 1.

## Project Structure

```
llm-opinion-study/
├── app.js                       # Main application file
├── package.json                 # Dependencies and scripts
├── .env                         # Environment variables (create this file, not included in repo)
├── .gitignore                   # Git ignore configuration
├── public/                      # Static assets
│   ├── styles.css               # CSS styling
│   └── prevent-paste.js         # JS to prevent pasting in text fields
├── views/                       # EJS templates
│   ├── onboarding.ejs           # Introduction screen
│   ├── demographics.ejs         # Demographics collection
│   ├── proposition.ejs          # Political statement response
│   ├── proposition-emotions.ejs # Emotion response for writer's paragraph
│   ├── affect-grid.ejs          # Affect grid for emotional state
│   ├── llm-stance.ejs           # Rate LLM-generated content stance
│   ├── llm-edit.ejs             # Edit LLM-generated content
│   ├── llm-compare.ejs          # Compare original and edited paragraphs
│   ├── ai-usage.ejs             # Final question about AI usage
│   ├── completion.ejs           # Study completion
│   └── error.ejs                # Error handling
└── data/                        # Stored responses (automatically created)
```

## Study Flow

The application guides writers through the following steps:

1. **Onboarding**: Introduction to the study
2. **Demographics**: Collection of participant information
3. **For each assigned proposition (political statement)**:
   - **Opinion expression**: Rating stance, writing bullet points and paragraph
   - **Emotion assessment**: Rating emotions felt while writing
   - **Affect grid**: Placing their emotional state on a 2D grid
4. **For each proposition again**:
   - **LLM-generated content**: Viewing and rating the stance of AI-written paragraph
   - **Content editing**: Editing the AI paragraph to better reflect their opinion
   - **Paragraph comparison**: Choosing between original and edited paragraphs
5. **AI usage question**: Whether they used AI assistance during the study
6. **Completion**: Thank you page with completion code for Prolific

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

## LLM Integration

The study uses OpenRouter's API to access various LLMs. Each participant is randomly assigned one of these models:

- OpenAI (GPT-4o-mini)
- Anthropic (Claude 3.5 Sonnet)
- Meta (Llama 3.1 8B Instruct)
- Qwen (Qwen 2.5 7B Instruct)

Along with one of four sub-conditions that determine how the LLM uses their inputs:

1. **Stance-based**: LLM generates content based on the numerical stance rating
2. **Bullets-based**: LLM generates content based on bullet points
3. **Paraphrase**: LLM rewrites the participant's paragraph
4. **Improve**: LLM enhances the participant's paragraph

## Data Storage

The application stores participant data in two possible ways:

1. **Primary**: AWS S3 bucket storage
2. **Fallback**: Local JSON files in the `data/` directory

Data is stored with the naming format:
```
participant_{PROLIFIC_ID}_{TIMESTAMP}.json
```

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
   heroku create llm-opinion-study
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

## Prolific Integration

To integrate with Prolific:

1. Create a new study on Prolific
2. Set the study URL to your Heroku app URL with URL parameters:
   ```
   https://your-heroku-app.herokuapp.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
   ```
3. The application will automatically generate and display a completion code upon study completion

## Customizing the Study

### Modifying Propositions

Edit the `propositions` array in `app.js` to change the political statements presented to participants:

```javascript
const propositions = [
  "The UK should implement a Universal Basic Income for all citizens.",
  "The UK should significantly increase its investment in renewable energy.",
  // Add more propositions as needed
];
```

### Adjusting the Flow

- Change the number of propositions assigned to each participant by modifying the count parameter in the `getRandomPropositions` function call
- Adjust progression percentages in the EJS templates to reflect changes in the number of steps

## Security Features

- **Prevent Paste**: The application includes JavaScript to prevent participants from pasting text into form fields, encouraging original writing
- **Session Management**: Express session middleware maintains participant state throughout the study
- **Error Handling**: Dedicated error pages for various situations