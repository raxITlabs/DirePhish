"""Test data flywheel: store and retrieve aggregate outcomes."""
from unittest.mock import MagicMock, patch


def _make_mock_firestore_memory():
    """Create a FirestoreMemory instance with mocked Firestore client and embedder."""
    with patch("app.services.firestore_memory.firestore") as mock_fs_module, \
         patch("app.services.firestore_memory.GeminiEmbeddingClient"), \
         patch("app.services.firestore_memory._firestore_client", None):
        # Mock the Firestore client
        mock_client = MagicMock()
        mock_fs_module.Client.return_value = mock_client
        mock_fs_module.SERVER_TIMESTAMP = "MOCK_TIMESTAMP"
        mock_fs_module.Query.DESCENDING = "DESCENDING"

        from app.services.firestore_memory import FirestoreMemory
        memory = FirestoreMemory()

        return memory, mock_client, mock_fs_module


def test_store_aggregate_outcome():
    """store_aggregate_outcome should write to mc_aggregates collection."""
    memory, mock_client, _ = _make_mock_firestore_memory()

    # Set up mock chain: db.collection("mc_aggregates").document() -> doc_ref
    mock_collection = MagicMock()
    mock_doc_ref = MagicMock()
    mock_doc_ref.id = "mock_doc_123"
    mock_collection.document.return_value = mock_doc_ref
    mock_client.collection.return_value = mock_collection

    aggregate = {
        "batch_id": "mc_test_001",
        "project_id": "proj_test",
        "mode": "test",
        "iterations": 3,
        "outcome_distribution": {"contained_early": 2, "not_contained": 1},
        "containment_round_stats": {"mean": 5.0, "median": 4.0, "std": 2.0},
        "cost_summary": {"total_usd": 0.21},
    }

    doc_id = memory.store_aggregate_outcome(aggregate)

    assert doc_id == "mock_doc_123"
    mock_client.collection.assert_called_with("mc_aggregates")
    mock_doc_ref.set.assert_called_once()

    # Verify the data written
    written_data = mock_doc_ref.set.call_args[0][0]
    assert written_data["batch_id"] == "mc_test_001"
    assert written_data["project_id"] == "proj_test"
    assert written_data["iterations"] == 3
    assert written_data["outcome_distribution"]["contained_early"] == 2


def test_get_project_aggregates():
    """get_project_aggregates should query mc_aggregates filtered by project_id."""
    memory, mock_client, mock_fs_module = _make_mock_firestore_memory()

    # Create mock docs
    mock_doc1 = MagicMock()
    mock_doc1.to_dict.return_value = {
        "batch_id": "mc_test_001",
        "project_id": "proj_test",
        "outcome_distribution": {"contained_early": 2, "not_contained": 1},
    }

    # Build the chain: collection().where().order_by().limit().get()
    mock_collection = MagicMock()
    mock_where = MagicMock()
    mock_order = MagicMock()
    mock_limit = MagicMock()

    mock_client.collection.return_value = mock_collection
    mock_collection.where.return_value = mock_where
    mock_where.order_by.return_value = mock_order
    mock_order.limit.return_value = mock_limit
    mock_limit.get.return_value = [mock_doc1]

    results = memory.get_project_aggregates("proj_test")

    assert len(results) == 1
    assert results[0]["batch_id"] == "mc_test_001"
    mock_collection.where.assert_called_with("project_id", "==", "proj_test")


def test_get_containment_probability_with_data():
    """get_containment_probability should calculate rate from outcome distributions."""
    memory, mock_client, mock_fs_module = _make_mock_firestore_memory()

    # Mock two aggregate docs
    mock_doc1 = MagicMock()
    mock_doc1.to_dict.return_value = {
        "outcome_distribution": {"contained_early": 7, "not_contained": 3},
    }
    mock_doc2 = MagicMock()
    mock_doc2.to_dict.return_value = {
        "outcome_distribution": {"contained_early": 5, "contained_late": 3, "not_contained": 2},
    }

    mock_collection = MagicMock()
    mock_where = MagicMock()
    mock_order = MagicMock()
    mock_limit = MagicMock()

    mock_client.collection.return_value = mock_collection
    mock_collection.where.return_value = mock_where
    mock_where.order_by.return_value = mock_order
    mock_order.limit.return_value = mock_limit
    mock_limit.get.return_value = [mock_doc1, mock_doc2]

    prob = memory.get_containment_probability("proj_test")

    # doc1: 7 contained out of 10, doc2: 8 contained out of 10
    # total: 15 contained out of 20 = 0.75
    assert prob == 0.75


def test_get_containment_probability_no_data():
    """get_containment_probability should return 0.5 (neutral prior) with no data."""
    memory, mock_client, mock_fs_module = _make_mock_firestore_memory()

    mock_collection = MagicMock()
    mock_where = MagicMock()
    mock_order = MagicMock()
    mock_limit = MagicMock()

    mock_client.collection.return_value = mock_collection
    mock_collection.where.return_value = mock_where
    mock_where.order_by.return_value = mock_order
    mock_order.limit.return_value = mock_limit
    mock_limit.get.return_value = []

    prob = memory.get_containment_probability("proj_nonexistent")

    assert prob == 0.5
