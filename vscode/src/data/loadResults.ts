import {
  EnhancedIncident,
  GetSolutionResult,
  Incident,
  LocalChange,
  RuleSet,
  Scope,
  Solution,
} from "@editor-extensions/shared";
import { processIncidents } from "./analyzerResults";
import { ExtensionState } from "src/extensionState";
import { writeDataFile } from "./storage";
import { toLocalChanges, writeSolutionsToMemFs } from "./virtualStorage";
import {
  KONVEYOR_SCHEME,
  RULE_SET_DATA_FILE_PREFIX,
  SOLUTION_DATA_FILE_PREFIX,
} from "../utilities";
import { castDraft, Immutable } from "immer";

export const loadRuleSets = async (state: ExtensionState, receivedRuleSets: RuleSet[]) => {
  await writeDataFile(receivedRuleSets, RULE_SET_DATA_FILE_PREFIX);
  const enhancedIncidents = enhanceIncidentsFromRuleSets(receivedRuleSets);

  const data = state.mutateData((draft) => {
    draft.ruleSets = receivedRuleSets;
    draft.enhancedIncidents = enhancedIncidents;
  });
  const diagnosticTuples = processIncidents(data.ruleSets);
  state.diagnosticCollection.clear();
  state.diagnosticCollection.set(diagnosticTuples);
};

export const cleanRuleSets = (state: ExtensionState) => {
  state.diagnosticCollection.clear();
  state.mutateData((draft) => {
    draft.ruleSets = [];
  });
};

export const loadSolution = async (state: ExtensionState, solution: Solution, scope?: Scope) => {
  await writeDataFile(solution, SOLUTION_DATA_FILE_PREFIX);
  await doLoadSolution(
    state,
    toLocalChanges(solution),
    solution,
    scope ?? (solution as GetSolutionResult).scope,
  );
};

const doLoadSolution = async (
  state: ExtensionState,
  localChanges: LocalChange[],
  solution?: Immutable<Solution>,
  scope?: Immutable<Scope>,
) => {
  state.memFs.removeAll(KONVEYOR_SCHEME);
  await writeSolutionsToMemFs(localChanges, state);
  state.mutateData((draft) => {
    draft.localChanges = localChanges;
    draft.solutionData = castDraft(solution);
    draft.solutionScope = castDraft(scope);
  });
};

function enhanceIncidentsFromRuleSets(ruleSets: RuleSet[]): EnhancedIncident[] {
  return ruleSets.flatMap((ruleSet) =>
    Object.entries(ruleSet.violations || {}).flatMap(([violationId, violation]) =>
      violation.incidents.map((incident: Incident) => ({
        ...incident,
        ruleset_name: ruleSet.name,
        ruleset_description: ruleSet.description,
        violation_name: violationId,
        violation_description: violation.description,
        violation_category: violation.category,
        violation_labels: violation.labels,
        violationId,
        uri: incident.uri,
        message: incident.message,
      })),
    ),
  );
}
