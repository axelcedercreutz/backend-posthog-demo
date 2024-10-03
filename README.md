# POC of backend enpoints for backend-only implementation of Posthog

This repository is a POC for setting up an backend-only implementation of PostHog for analytics.
The implementation utilizes HTTP-only Cookies to store the user ID, organization ID & project ID to be stored over sessions.

## Getting Started

### Prerequisites

- Node.js (v20 or later)
- npm (v10 or later)

### Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/axelcedercreutz/backend-posthog-demo.git
    cd backend-posthog-demo
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

### Running the Server

To start the development server, run:
```sh
npm run dev
```

## Features
- **Express**
- **TypeScript**
- **PostHog**

## TODOs
- complete session information (last external url click still missing)
- feature flag fetching