# Flag Summit

Teams paint an 8×5 pixel flag and plant it at base camp. The host awards wins, and each win moves a flag one camp up the mountain. Nine wins reaches the summit.

- **Front end:** `public/index.html`, with the painter, mountain, and standings. It updates live for everyone.
- **Back end:** `server.js`, written in plain Node.js with no packages to install. Data is saved to `data.json`.

## Run it on your computer

1. Install Node.js 18 or newer.
2. In this folder, run:
   ```
   HOST_KEY=pick-a-password npm start
   ```
   On Windows PowerShell, run: `$env:HOST_KEY="pick-a-password"; npm start`
3. Open http://localhost:3000
4. Click **Host login** and enter your password. In host mode you can drag a flag on the mountain to any camp, use the +1 win, −, and Remove buttons, and reset every team to base camp.

## Put it online (Render, free tier)

1. Upload this folder to a new GitHub repository.
2. On render.com, choose **New → Web Service** and select the repository.
3. Set the build command to *(leave blank)* and the start command to `npm start`.
4. Under **Environment**, add `HOST_KEY` = your password.
5. Deploy. Render gives you a public link to share with teams.

Free hosts can wipe files on restart. To keep scores between restarts, attach a persistent disk and set `DATA_FILE=/var/data/data.json`. Railway and Fly.io work the same way.

## Settings

| Variable    | Default       | What it does                 |
|-------------|---------------|------------------------------|
| `HOST_KEY`  | `changeme`    | Password for awarding wins   |
| `PORT`      | `3000`        | Port the server listens on   |
| `DATA_FILE` | `./data.json` | Where teams and scores are saved |

## API

| Method | Path                    | Who    | Body                     |
|--------|-------------------------|--------|--------------------------|
| GET    | `/api/state`            | anyone | none                     |
| GET    | `/api/events`           | anyone | live stream (SSE)        |
| POST   | `/api/teams`            | anyone | `{name, grid[40]}`       |
| PUT    | `/api/teams/:id`        | anyone | `{name, grid[40]}`       |
| POST   | `/api/teams/:id/wins`   | host   | `{delta: 1 or -1}` or `{wins: 0-9}` |
| POST   | `/api/reset`            | host   | none (all flags to base) |
| DELETE | `/api/teams/:id`        | host   | none                     |

Host requests send the password in the `x-host-key` header.
