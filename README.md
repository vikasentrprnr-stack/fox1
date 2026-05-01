# Fox - AI Assistant

Fox is a highly intellectual and interactive AI assistant built to provide dynamic conversational experiences. It features a text-based chat interface, a low-latency live voice interaction mode, and customizable settings to tweak its personality. The application is built using modern web technologies and powered by the Gemini API.

## Core Features

- **Text Chat:** A persistent conversational interface that supports markdown rendering and syntax highlighting for code blocks.
- **Live Voice Interaction:** A real-time voice mode that allows you to speak to Fox and hear its responses via audio stream, creating a natural back-and-forth conversation.
- **Text-to-Speech:** Provides text-to-speech generation for any text message in the chat.
- **Customizable Personality:** You can adjust the assistant's sarcasm level and choose its voice persona.
- **Local Persistence:** Chat history and user preferences are saved locally in the browser.

## Component Overview

The application is structured into several modular React components:

### Chat Interface
The `Chat` component is the main workhorse for text interactions. It displays the conversation history, accepts user input, and manages the state of the streaming response from the AI. The chat history is styled with Tailwind CSS to look like a modern messaging app and uses specialized libraries to render markdown and code accurately. It also includes inline controls to play the AI's responses out loud using text-to-speech.

### Voice Interface
The `VoiceInterface` component handles the live audio session. When activated, it captures audio from the user's microphone, processes it into the format required by the API, and sends it over a WebSocket connection. It concurrently receives audio data from the server and plays it back through the browser's audio context. It includes a visual indicator to show when the AI is listening or speaking.

### Settings Panel
The `Settings` component provides a user configuration interface. Here, you can adjust the "sarcasm level" slider, which dynamically updates the system instructions sent to the AI, altering its persona. It also allows you to preview and select different prebuilt voices for the text-to-speech engine. Finally, it provides controls to wipe local data.

## Services and Application Logic

The application separates its core logic and state management from the UI components:

### AI Service (ai.ts)
This module acts as the bridge between the application and the Gemini API. It encapsulates the logic for establishing the AI client and fetching API keys. It exports functions for streaming chat responses and requesting text-to-speech generation. It ensures that the rest of the application does not need to worry about the underlying implementation details of the API calls.

### Database Service (db.ts)
To keep the application fast and privacy-focused, all data is stored on the client side. The database service uses Dexie, a wrapper around IndexedDB, to manage the storage of chat messages and user configuration. It provides simple asynchronous functions to load history, save new messages, update settings, and clear data.

### Audio Utilities (audioUtils.ts)
This utility file contains the low-level logic required for the live voice feature. It includes the AudioWorklet processor definition, which runs on a separate thread to handle audio input without blocking the main user interface. It also provides the necessary buffer conversion functions to translate between the browser's audio format and the format expected by the API.

## Technical Stack

- **React:** The frontend framework used to build the user interface.
- **Vite:** The build tool and development server.
- **Tailwind CSS:** The utility-first CSS framework used for styling all components.
- **Gemini API:** The underlying intelligence, providing text generation, text-to-speech, and live audio capabilities.
- **Dexie:** The database library used for local storage via IndexedDB.
- **Lucide React:** The icon library used throughout the application.
- **Framer Motion:** Used to add smooth transitions and animations to the user interface.

