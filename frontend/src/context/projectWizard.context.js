import React, { createContext, useContext, useReducer, useMemo, useEffect } from 'react';

const initialState = {
  draftId: null,
  isDraftSaved: false,
  currentStep: 0,
  basicInfo: {
    project_name: '',
    client_name: '',
    industry: '',
    project_type: '',
    delivery_model: '',
  },
  deliveryDetails: {
    start_date: '',
    planned_end_date: '',
    sprint_length: '',
    release_frequency: '',
  },
  teamComposition: {
    rows: [
      {
        role: 'PM',
        count: 1,
        avgExperience: '',
        location: '',
      },
    ],
    locations: '',
    offshoreOnshoreRatio: '',
  },
  technology: {
    technology_stack: '',
    architecture_type: '',
    cloud_platform: '',
    integration_count: '',
    complexity: '',
  },
  financial: {
    budget: '',
    planned_effort: '',
    estimated_team_size: '',
  },
  risks: {
    dependency_count: '',
    compliance_requirements: '',
    criticality: '',
    requirement_stability_index: '',
  },
};

const ProjectWizardContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return {
        ...state,
        currentStep: action.payload,
      };
    case 'UPDATE_SECTION':
      return {
        ...state,
        [action.section]: {
          ...state[action.section],
          ...action.payload,
        },
      };
    case 'SET_TEAM_ROWS':
      return {
        ...state,
        teamComposition: {
          ...state.teamComposition,
          rows: action.payload,
        },
      };
    case 'SET_DRAFT_ID':
      return {
        ...state,
        draftId: action.payload,
      };
    case 'SET_DRAFT_SAVED':
      return {
        ...state,
        isDraftSaved: action.payload,
      };
    case 'LOAD_DRAFT':
      return {
        ...state,
        ...action.payload,
        draftId: action.draftId || state.draftId,
        isDraftSaved: true,
      };
    case 'RESET_WIZARD':
      return initialState;
    default:
      return state;
  }
}

export function ProjectWizardProvider({ children, initialDraft }) {
  const initState = initialDraft
    ? {
        ...initialState,
        ...initialDraft,
        draftId: initialDraft.draftId || null,
        isDraftSaved: true,
      }
    : initialState;

  const [state, dispatch] = useReducer(reducer, initState);

  useEffect(() => {
    if (initialDraft) {
      dispatch({ type: 'LOAD_DRAFT', draftId: initialDraft.draftId, payload: initialDraft });
    }
  }, [initialDraft]);

  const contextValue = useMemo(
    () => ({
      state,
      setCurrentStep: (step) => dispatch({ type: 'SET_CURRENT_STEP', payload: step }),
      updateSection: (section, payload) => dispatch({ type: 'UPDATE_SECTION', section, payload }),
      setTeamRows: (rows) => dispatch({ type: 'SET_TEAM_ROWS', payload: rows }),
      setDraftId: (draftId) => dispatch({ type: 'SET_DRAFT_ID', payload: draftId }),
      setDraftSaved: (saved) => dispatch({ type: 'SET_DRAFT_SAVED', payload: saved }),
      loadDraft: (draftId, draftData) => dispatch({ type: 'LOAD_DRAFT', draftId, payload: draftData }),
      resetWizard: () => dispatch({ type: 'RESET_WIZARD' }),
    }),
    [state]
  );

  return <ProjectWizardContext.Provider value={contextValue}>{children}</ProjectWizardContext.Provider>;
}

export function useProjectWizard() {
  const context = useContext(ProjectWizardContext);
  if (!context) {
    throw new Error('useProjectWizard must be used inside a ProjectWizardProvider');
  }
  return context;
}
