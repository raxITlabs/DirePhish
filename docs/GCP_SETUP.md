# Google Cloud Setup

DirePhish requires a GCP project with Firestore in Native mode. Firestore is used
for vector memory during simulations, knowledge graph persistence, Monte Carlo
aggregation, and risk score storage. There is no local fallback.

## One-time setup

```bash
# 1. Install gcloud CLI (if not already installed)
brew install google-cloud-sdk

# 2. Authenticate
gcloud auth login
gcloud auth application-default login

# 3. Create or select a GCP project
gcloud projects create direphish-sim --name="DirePhish Simulation"
# OR use an existing project:
gcloud config set project YOUR_PROJECT_ID

# 4. Enable the Firestore API
gcloud services enable firestore.googleapis.com

# 5. Create Firestore database (must be Native mode, not Datastore)
gcloud firestore databases create --location=us-east1 --type=firestore-native

# 6. Create vector search indexes
cd backend && bash scripts/create_firestore_indexes.sh

# 7. Add to your .env
echo "GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID" >> ../.env
```

## Verify indexes

```bash
gcloud firestore indexes composite list
```

All indexes should show `READY` before running simulations. Index creation
typically takes 2-5 minutes.

## Optional tuning

Add to `.env` if needed:

```env
GEMINI_EMBEDDING_MODEL=gemini-embedding-001   # embedding model
GEMINI_EMBEDDING_DIMENSIONS=768                # vector dimensions
MONTE_CARLO_MAX_WORKERS=3                      # concurrent sim iterations
GEMINI_RPM_LIMIT=60                            # API rate limit (free: 30, paid: 1500)
```

## Troubleshooting

- **"Database already exists"** -- Use `gcloud config set project YOUR_PROJECT_ID`
  to switch to your existing project, then skip step 5.
- **Indexes stuck in CREATING** -- Wait 5 minutes and re-check with
  `gcloud firestore indexes composite list`. Large indexes can take longer.
- **"Permission denied" on Firestore calls** -- Make sure you ran
  `gcloud auth application-default login` (step 2). This sets the local
  credentials that the Python SDK uses.
- **`find_nearest()` errors** -- The vector indexes aren't ready yet. Wait for
  all indexes to show `READY` status.
