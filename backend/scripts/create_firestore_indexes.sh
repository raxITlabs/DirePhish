#!/usr/bin/env bash
# Create Firestore composite indexes for vector search.
# Run once after setting up the GCP project.
# Indexes take a few minutes to build — find_nearest() will fail until ready.
#
# Usage: bash scripts/create_firestore_indexes.sh

set -euo pipefail

echo "Creating Firestore composite indexes for DirePhish..."
echo "This may take a few minutes per index."
echo ""

# 1: sim_episodes — filter by sim_id + vector (agent memory during sim)
echo "[1/4] sim_episodes: sim_id + vector"
gcloud firestore indexes composite create \
  --collection-group=sim_episodes \
  --field-config=field-path=sim_id,order=ASCENDING \
  --field-config='field-path=embedding,vector-config={"dimension":"768","flat":{}}' \
  --database="(default)" \
  --quiet || echo "  (may already exist)"

# 2: sim_episodes — filter by sim_id + category + vector (filtered search)
echo "[2/4] sim_episodes: sim_id + category + vector"
gcloud firestore indexes composite create \
  --collection-group=sim_episodes \
  --field-config=field-path=sim_id,order=ASCENDING \
  --field-config=field-path=category,order=ASCENDING \
  --field-config='field-path=embedding,vector-config={"dimension":"768","flat":{}}' \
  --database="(default)" \
  --quiet || echo "  (may already exist)"

# 3: sim_episodes — filter by batch_id + vector (cross-iteration Monte Carlo)
echo "[3/4] sim_episodes: batch_id + vector"
gcloud firestore indexes composite create \
  --collection-group=sim_episodes \
  --field-config=field-path=batch_id,order=ASCENDING \
  --field-config='field-path=embedding,vector-config={"dimension":"768","flat":{}}' \
  --database="(default)" \
  --quiet || echo "  (may already exist)"

# 4: dossier_chunks — filter by project_id + vector
echo "[4/4] dossier_chunks: project_id + vector"
gcloud firestore indexes composite create \
  --collection-group=dossier_chunks \
  --field-config=field-path=project_id,order=ASCENDING \
  --field-config='field-path=embedding,vector-config={"dimension":"768","flat":{}}' \
  --database="(default)" \
  --quiet || echo "  (may already exist)"

echo ""
echo "All index creation requests submitted."
echo "Run 'gcloud firestore indexes composite list' to check status."
echo "Indexes are ready when state shows READY (not CREATING)."
