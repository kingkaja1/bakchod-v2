# GIF Search Setup (GIPHY API)

GIF search uses the **GIPHY API**. Follow these steps to enable it:

## 1. Get a free API key

1. Go to **[developers.giphy.com](https://developers.giphy.com)**
2. Sign up or log in
3. Open the **[Dashboard](https://developers.giphy.com/dashboard)**
4. Click **Create an App**
5. Choose **API**
6. Fill in:
   - **App Name:** e.g. `Bakchod`
   - **App Description:** e.g. `Chat app with GIF search`
7. Accept terms and create the app
8. Copy your **API Key** (starts as a beta key; 100 requests/hour free)

## 2. Add the key to your project

1. In the project root, copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your key:
   ```
   VITE_GIPHY_API_KEY=your_actual_key_here
   ```

3. Replace `your_actual_key_here` with the API key from step 1

## 3. Restart and build

- **Dev:** Restart `npm run dev` so Vite picks up the new env
- **Production:** Run `npm run build` and redeploy

## 4. Verify

1. Open the app and go to a chat
2. Tap the emoji icon next to the message input
3. Switch to the **GIF** tab
4. You should see trending GIFs; search should work

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Add GIPHY API key" message | Ensure `VITE_GIPHY_API_KEY` is in `.env` and the dev server was restarted |
| No GIFs loading | Check the key is correct; beta keys have 100 calls/hour limit |
| CORS / network errors | Ensure the GIPHY key is for **Web** (not iOS/Android) |

## Production / higher limits

For more than 100 API calls per hour, apply for a production key in the GIPHY dashboard.
