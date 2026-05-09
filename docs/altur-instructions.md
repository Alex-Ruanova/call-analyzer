
---

## 1. Introduction

The challenge project consists of building a small web application that allows users to upload a short audio recording file of a sales phone call (WAV or MP3) and then transcribe the audio using a STT (speech-to-text) model and analyze it with an LLM. You will build the app around this core functionality.

We estimate ~5-6 hours of work, please don't go over, use the README for what you'd do with more time.

---

## 2. Scope & Requirements

These are the required features for your submission to be considered complete:

- A web app in which a user can upload an audio file (WAV or MP3).
- Backend service that receives the file, processes it and produces a transcript using a STT model.
- Integration with an LLM to analyze the transcript and output:
  - A summary of the call.
  - Propose a tagging schema for sales calls and justify it. Document your prompt design and how you'd evaluate tagging quality over time.
- Data persistence: save at least the following for each call: audio file metadata (filename, upload timestamp), transcript, summary and tags.
- UI to list all processed calls and allow clicking into one to view full details.
- Design the API and UI for the workflows you'd expect a user to need.
- Describe your testing strategy and ship enough tests to demonstrate it.
- Solid error handling.
- README with clear instructions: how to install/run locally (and optionally via Docker), how to test, what assumptions you made, your architecture/design decisions, what you'd improve given more time.
- Git version control with meaningful commits (not a single 'done' commit).

### Important constraints and considerations

- Calls can be up to 30 minutes long; the upload endpoint must return immediately and the UI must handle calls that take several minutes to process.
- Users might want to process large quantities of recordings in a short period of time, e.g. 1,000 recordings at once.

---

## 3. Bonus / Stretch Goals

These are optional but will help you stand out:

- Your call analysis is able to detect who is speaking (roles).
- Detects user intent, emotional response, mood, etc.
- Extract valuable data / extra insights from conversations.
- Allow users to override tags.
- Docker-compose setup (backend + frontend + database) so it can run with a single command.
- Analytics dashboard: total number of calls processed, average tags per call, distribution of tags etc.
- Additional tests (edge cases, error conditions), more polish in UI (responsive design, nice styling).
- **Super extra:**
  - Multi-user or authentication (basic) so different users can view/upload calls (only if time allows).
  - Support for downloading/exporting a call record as JSON (audio metadata + transcript + summary + tags + overrides).
  - Deployment to a live preview (e.g., free tier of Heroku, Vercel, etc), so we can click through a running version.

---

## 4. Tech Stack Suggestions

These are just suggestions, you are free to use your preferred stack within reason.

- **Backend:** e.g., Python (FastAPI) or Django REST.
- **Database:** your choice.
- **Frontend:** your choice.
- **STT/LLM:** OpenAI models (ElevenLabs and Deepgram are also good STT options).
- **Optional Dockerization.**
- **LLM Coding Tools:** Tools like (Cursor/Windsurf/Claude Code) are permitted. However, **please do not rely exclusively on the LLM to write your whole app**. We place strong value on your ability to understand, explain and maintain the code you deliver. If large chunks of the system were entirely "auto-generated" without your involvement, this becomes evident and makes it difficult for us later to evaluate your design decisions and trade-offs.

---

## 5. Architecture & Scale

Please include a markdown file with written answers for the following questions (you will be asked to explain your reasoning in further interviews):

- How does this scale to 10k calls/day?
- Where are the bottlenecks?
- What would you change for production?
- How would you ensure correct PII handling and storage?

---

## 6. Evaluation Criteria

Here's how we'll evaluate submissions (and how we'll think about your work). We'll score broadly across these dimensions:

| Dimension | What we look for |
|---|---|
| **Functionality** | Does it meet the must-have requirements? Upload → transcript → summary → tag → UI + API. |
| **Code quality & architecture** | Clear structure, modular code, readable, separation of concerns. Reasonable choices for stack/components. |
| **Use of LLM/AI logic** | Thoughtful integration. How did you frame the prompt or logic? How did you handle failure or edge cases? |
| **Documentation & README** | Clear instructions for running the app, explanation of architecture/trade-offs/assumptions, README quality. |
| **Tests & error handling** | Presence of tests for important logic; handling invalid input/file errors; sensible defaults and fallback. |
| **UI/UX & API design** | API design choices are coherent with the workflows. |
| **Polish & extras** | Bonus features implemented, Docker or deployment, exports or analytics, etc. |
| **Communication & trade-offs** | Documentation communicates possible improvements and logic behind code and prompting decisions. |

We'll weight "must-haves" more heavily; bonus features will boost standing but will not penalize you for omitting them if you haven't had time.

---

## 7. Submission & Next Steps

1. Create a GitHub (or GitLab) repo and commit your work, with meaningful commit messages.
2. In your README, include:
   - Setup / installation instructions (how to run locally, optionally via Docker)
   - How to test your solution
   - Any required environment variables or API keys
   - The assumptions you made, key architectural/design choices, what you would improve given more time
3. After submission, we'll review your work and invite selected candidates to a follow-up interview to walk through your code, decisions, and thought-process. In case you are not selected for next steps, we will provide you with written feedback on our decision.