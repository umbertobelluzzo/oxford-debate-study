# LLM Opinion Distortion Study Interface

This repository contains the web interface for the "Quantifying the Distortive Impacts of LLM Writing Assistance for Opinion Expression" study. The application facilitates collecting data on how LLMs may influence opinion expression, with integration for Prolific participant recruitment.

## Study Overview

This study examines whether the use of LLMs for writing assistance systematically distorts opinions expressed by users, as perceived both by the users themselves and by third-party raters. The study is conducted in two phases:

1. **Phase 1 (Writing)**: Participants express opinions on political topics and then interact with LLM-generated content.
2. **Phase 2 (Rating)**: A separate group of participants evaluate the content produced in Phase 1.

## Project Structure

```
llm-opinion-study/
├── app.js                # Main application file
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (create this file, not included in repo)
├── .gitignore            # Git ignore configuration
├── public/               # Static assets
│   └── styles.css        # CSS styling
├── views/                # EJS templates
│   ├── onboarding.ejs    # Introduction screen
│   ├── demographics.ejs  # Demographics collection
│   ├── proposition.ejs   # Political statement response
│   ├── llm-response.ejs  # LLM generated content
│   ├── completion.ejs    # Study completion
│   └── error.ejs         # Error handling
└── data/                 # Stored responses (automatically created)
```

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
   OPENAI_API_KEY=your-openai-api-key
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

The study currently includes five LLMs for comparison:
- GPT-4o (OpenAI)
- Claude 3.7 Sonnet (Anthropic)
- Llama 3.1 70B Instruct (Meta)
- Qwen 2.5 72B Instruct (Alibaba)
- DeepSeek-V3 (DeepSeek)

Each participant is randomly assigned one of these models, along with one of four sub-conditions that determine how the LLM uses their inputs:
1. Stance-based: LLM generates content based on numerical stance rating
2. Bullets-based: LLM generates content based on bullet points
3. Paraphrase: LLM rewrites the participant's paragraph
4. Improve: LLM enhances the participant's paragraph

Currently, the app is configured to use OpenAI's API. To use additional LLM APIs, add the necessary API keys to your `.env` file and update the model selection logic in `app.js`.

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
   heroku config:set OPENAI_API_KEY=your-openai-key
   ```

4. Deploy to Heroku:
   ```
   git push heroku main
   ```

5. Open the application:
   ```
   heroku open
   ```

## Prolific Integration

To integrate with Prolific:

1. Create a new study on Prolific
2. Set the study URL to your Heroku app URL with URL parameters:
   ```
   https://your-heroku-app.herokuapp.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
   ```
3. The application will automatically generate and display a completion code upon study completion

## Data Storage

For development and testing, participant data is saved as JSON files in the `data/` directory with the naming format:
```
participant_{PROLIFIC_ID}_{TIMESTAMP}.json
```

For production deployment, consider implementing a database solution:

1. Add a database add-on to your Heroku app (e.g., MongoDB, PostgreSQL)
2. Install the corresponding Node.js driver
3. Update the `saveParticipantData` function in `app.js` to use the database

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

## Session Management

The application uses Express session middleware to maintain participant state throughout the study. Session data includes:
- Participant identification (Prolific ID, study ID, session ID)
- Demographic information
- Proposition responses
- LLM interaction data

Session data is cleared upon study completion.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request