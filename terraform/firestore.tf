# Firestore vector indexes (sim_episodes ×3, dossier_chunks ×1) are created
# out-of-band by backend/scripts/create_firestore_indexes.sh and already exist on
# this project. They are intentionally NOT managed here (Terraform creation
# returns 409 "index already exists"). If standing up a fresh project, run that
# script once, or re-add google_firestore_index resources here.
#
# Definitions (768-dim flat vector on `embedding`):
#   sim_episodes:   (sim_id) + embedding
#   sim_episodes:   (sim_id, category) + embedding
#   sim_episodes:   (batch_id) + embedding
#   dossier_chunks: (project_id) + embedding
