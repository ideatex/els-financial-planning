/**
 * Dependency Graph & Topological Sorter for Calculation Stages
 */

import { CalculationStage } from '../domain/types/stage.types';

export function sortStagesTopologically(stages: CalculationStage[]): CalculationStage[] {
  const stageMap = new Map<string, CalculationStage>();
  stages.forEach((s) => stageMap.set(s.name, s));

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: CalculationStage[] = [];

  function visit(stageName: string) {
    if (visited.has(stageName)) return;
    if (visiting.has(stageName)) {
      throw new Error(`Circular dependency detected in calculation stages: ${stageName}`);
    }

    visiting.add(stageName);
    const stage = stageMap.get(stageName);
    if (!stage) {
      throw new Error(`Missing dependency stage: ${stageName}`);
    }

    for (const dep of stage.dependencies) {
      visit(dep);
    }

    visiting.delete(stageName);
    visited.add(stageName);
    result.push(stage);
  }

  for (const stage of stages) {
    if (!visited.has(stage.name)) {
      visit(stage.name);
    }
  }

  return result;
}
