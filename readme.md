# LLM Opinion Distortion Study Interface

This repository contains the web interface for the "Quantifying the Distortive Impacts of LLM Writing Assistance for Opinion Expression" study. The application is designed to be deployed on Heroku and integrated with Prolific for participant recruitment.

## Project Structure

```
llm-opinion-study/
├── app.js                # Main application file
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (create this file, not included in repo)
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
   SESSION_SECRET=your-secret-key
   ```

## Development

Run the application locally with:
```
npm run dev
```

This will start the application with nodemon, which automatically restarts the server when changes are detected.

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

3. Add Heroku remote to your Git repository:
   ```
   heroku git:remote -a llm-opinion-study
   ```

4. Set environment variables on Heroku:
   ```
   heroku config:set NODE_ENV=production
   heroku config:set SESSION_SECRET=your-secret-key
   ```

5. Deploy to Heroku:
   ```
   git push heroku main
   ```

6. Open the application:
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
3. Set "Completion URL" on Prolific to redirect participants after study completion

## Customizing the Interface

### Adding Propositions

Edit the `propositions` array in `app.js` to include your study's political statements.

### Modifying LLM Integration

The current implementation uses placeholder text for LLM-generated content. To connect with actual LLM APIs:

1. Install appropriate API client libraries:
   ```
   npm install openai anthropic
   ```

2. Update the `generateModelParagraph` function in `app.js` to call the appropriate LLM API based on the assigned conditions.

### Data Storage

For development purposes, data is saved to local JSON files in the `data` directory. For production:

1. Add a database add-on to your Heroku app (e.g., MongoDB, PostgreSQL)
2. Install the corresponding Node.js driver
3. Update the data storage functions to use the database instead of local files

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
