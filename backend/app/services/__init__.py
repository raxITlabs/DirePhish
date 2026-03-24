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

# OASIS modules depend on Zep (deprecated — may not be available)
try:
    from .oasis_profile_generator import OasisProfileGenerator, OasisAgentProfile
    from .simulation_manager import SimulationManager, SimulationState, SimulationStatus
    from .simulation_config_generator import (
        SimulationConfigGenerator,
        SimulationParameters,
        AgentActivityConfig,
        TimeSimulationConfig,
        EventConfig,
        PlatformConfig
    )
    from .simulation_runner import (
        SimulationRunner,
        SimulationRunState,
        RunnerStatus,
        AgentAction,
        RoundSummary
    )
    from .graph_builder import GraphBuilderService
    from .zep_entity_reader import ZepEntityReader, EntityNode, FilteredEntities
    from .zep_graph_memory_updater import (
        ZepGraphMemoryUpdater,
        ZepGraphMemoryManager,
        AgentActivity
    )
except ImportError:
    # Zep/OASIS modules not available — Crucible flow doesn't need them
    pass

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
