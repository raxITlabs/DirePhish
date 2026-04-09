"""
Business Services Module

Note: OASIS/Zep-dependent modules are guarded with try/except since
Zep and Graphiti have been replaced by Firestore Vector Search.
"""

from .ontology_generator import OntologyGenerator
from .text_processor import TextProcessor
from .simulation_ipc import (
    SimulationIPCClient,
    SimulationIPCServer,
    IPCCommand,
    IPCResponse,
    CommandType,
    CommandStatus
)


__all__ = [
    'OntologyGenerator',
    'TextProcessor',
    'SimulationIPCClient',
    'SimulationIPCServer',
    'IPCCommand',
    'IPCResponse',
    'CommandType',
    'CommandStatus',
]
