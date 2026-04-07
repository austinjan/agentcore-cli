import { validateAwsCredentials } from '../../../aws/account';
import { listEvaluators } from '../../../aws/agentcore-control';
import { detectRegion } from '../../../aws/region';
import { getErrorMessage } from '../../../errors';
import { saveBatchEvalRun } from '../../../operations/eval/batch-eval-storage';
import { runBatchEvaluationCommand } from '../../../operations/eval/run-batch-evaluation';
import type {
  BatchEvaluationResult,
  RunBatchEvaluationCommandResult,
} from '../../../operations/eval/run-batch-evaluation';
import { loadDeployedProjectConfig } from '../../../operations/resolve-agent';
import {
  ConfirmReview,
  ErrorPrompt,
  GradientText,
  Panel,
  Screen,
  StepIndicator,
  TextInput,
  WizardMultiSelect,
  WizardSelect,
} from '../../components';
import type { SelectableItem } from '../../components';
import { HELP_TEXT } from '../../constants';
import { useListNavigation, useMultiSelectNavigation } from '../../hooks';
import type { EvaluatorItem } from '../online-eval/types';
import type { AgentItem } from './types';
import { Box, Text } from 'ink';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

type BatchEvalStep = 'agent' | 'evaluators' | 'name' | 'confirm';

interface BatchEvalConfig {
  agent: string;
  evaluators: string[];
  evaluatorNames: string[];
  name: string;
}

const STEP_LABELS: Record<BatchEvalStep, string> = {
  agent: 'Agent',
  evaluators: 'Evaluators',
  name: 'Name',
  confirm: 'Confirm',
};

type FlowState =
  | { name: 'loading' }
  | { name: 'wizard'; agents: AgentItem[]; evaluators: EvaluatorItem[] }
  | { name: 'running'; config: BatchEvalConfig; progress: string }
  | { name: 'results'; result: RunBatchEvaluationCommandResult }
  | { name: 'creds-error'; message: string }
  | { name: 'error'; message: string };

// ============================================================================
// Flow Component
// ============================================================================

interface RunBatchEvalFlowProps {
  onExit: () => void;
}

export function RunBatchEvalFlow({ onExit }: RunBatchEvalFlowProps) {
  const [flow, setFlow] = useState<FlowState>({ name: 'loading' });

  // Load agents and evaluators
  useEffect(() => {
    if (flow.name !== 'loading') return;
    let cancelled = false;

    void (async () => {
      try {
        await validateAwsCredentials();
      } catch (err) {
        if (!cancelled) setFlow({ name: 'creds-error', message: getErrorMessage(err) });
        return;
      }

      try {
        const { region } = await detectRegion();
        const [evalResult, context] = await Promise.all([listEvaluators({ region }), loadDeployedProjectConfig()]);

        if (cancelled) return;

        const evaluators: EvaluatorItem[] = evalResult.evaluators.map(e => ({
          arn: e.evaluatorArn,
          name: e.evaluatorName,
          type: e.evaluatorType,
          description: e.description,
        }));

        // Only show deployed agents
        const deployedAgentNames = new Set<string>();
        for (const target of Object.values(context.deployedState.targets)) {
          const runtimeStates = target.resources?.runtimes;
          if (runtimeStates) {
            for (const name of Object.keys(runtimeStates)) {
              deployedAgentNames.add(name);
            }
          }
        }

        const agents: AgentItem[] = context.project.runtimes
          .filter((a: { name: string }) => deployedAgentNames.has(a.name))
          .map((a: { name: string; build: string }) => ({ name: a.name, build: a.build }));

        if (agents.length === 0) {
          if (!cancelled) {
            setFlow({
              name: 'error',
              message:
                context.project.runtimes.length === 0
                  ? 'No agents found in project. Run `agentcore add agent` first.'
                  : 'No deployed agents found. Run `agentcore deploy` first.',
            });
          }
          return;
        }

        if (evaluators.length === 0) {
          if (!cancelled) {
            setFlow({ name: 'error', message: 'No evaluators found in your account. Create an evaluator first.' });
          }
          return;
        }

        setFlow({ name: 'wizard', agents, evaluators });
      } catch (err) {
        if (!cancelled) setFlow({ name: 'error', message: getErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow.name]);

  const handleWizardComplete = useCallback((config: BatchEvalConfig) => {
    setFlow({ name: 'running', config, progress: 'Starting batch evaluation...' });
  }, []);

  // Execute batch evaluation
  useEffect(() => {
    if (flow.name !== 'running') return;
    let cancelled = false;

    const { config } = flow;

    void (async () => {
      try {
        const result = await runBatchEvaluationCommand({
          agent: config.agent,
          evaluators: config.evaluators,
          name: config.name || undefined,
          onProgress: (_status, message) => {
            if (!cancelled) setFlow(prev => (prev.name === 'running' ? { ...prev, progress: message } : prev));
          },
        });

        if (cancelled) return;

        // Save results locally
        if (result.success) {
          try {
            saveBatchEvalRun(result);
          } catch {
            // Non-fatal
          }
        }

        if (!result.success) {
          setFlow({ name: 'error', message: result.error ?? 'Batch evaluation failed' });
          return;
        }

        setFlow({ name: 'results', result });
      } catch (err) {
        if (!cancelled) setFlow({ name: 'error', message: getErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (flow.name === 'loading') {
    return (
      <Screen title="Run Batch Evaluation" onExit={onExit}>
        <GradientText text="Loading agents and evaluators..." />
      </Screen>
    );
  }

  if (flow.name === 'creds-error') {
    return <ErrorPrompt message="AWS credentials required" detail={flow.message} onBack={onExit} onExit={onExit} />;
  }

  if (flow.name === 'wizard') {
    return (
      <BatchEvalWizard
        agents={flow.agents}
        evaluators={flow.evaluators}
        onComplete={handleWizardComplete}
        onExit={onExit}
      />
    );
  }

  if (flow.name === 'running') {
    return (
      <Screen title="Run Batch Evaluation" onExit={onExit}>
        <GradientText text={flow.progress} />
      </Screen>
    );
  }

  if (flow.name === 'results') {
    return <ResultsView result={flow.result} onRunAnother={() => setFlow({ name: 'loading' })} onExit={onExit} />;
  }

  return (
    <ErrorPrompt
      message="Batch evaluation failed"
      detail={flow.message}
      onBack={() => setFlow({ name: 'loading' })}
      onExit={onExit}
    />
  );
}

// ============================================================================
// Wizard Component
// ============================================================================

interface BatchEvalWizardProps {
  agents: AgentItem[];
  evaluators: EvaluatorItem[];
  onComplete: (config: BatchEvalConfig) => void;
  onExit: () => void;
}

function BatchEvalWizard({ agents, evaluators: rawEvaluators, onComplete, onExit }: BatchEvalWizardProps) {
  const skipAgent = agents.length <= 1;
  const allSteps = useMemo<BatchEvalStep[]>(
    () => (skipAgent ? ['evaluators', 'name', 'confirm'] : ['agent', 'evaluators', 'name', 'confirm']),
    [skipAgent]
  );

  const [step, setStep] = useState<BatchEvalStep>(allSteps[0]!);
  const [config, setConfig] = useState<BatchEvalConfig>({
    agent: skipAgent ? agents[0]!.name : '',
    evaluators: [],
    evaluatorNames: [],
    name: '',
  });

  const currentIndex = allSteps.indexOf(step);

  const goBack = useCallback(() => {
    const prev = allSteps[currentIndex - 1];
    if (prev) setStep(prev);
    else onExit();
  }, [allSteps, currentIndex, onExit]);

  const goNext = useCallback(() => {
    const next = allSteps[currentIndex + 1];
    if (next) setStep(next);
  }, [allSteps, currentIndex]);

  const agentItems: SelectableItem[] = useMemo(
    () => agents.map(a => ({ id: a.name, title: a.name, description: a.build })),
    [agents]
  );

  const evaluatorItems: SelectableItem[] = useMemo(
    () =>
      rawEvaluators.map(e => ({
        id: e.arn,
        title: e.name,
        description: e.type === 'Builtin' ? 'Built-in evaluator' : (e.description ?? 'Custom evaluator'),
      })),
    [rawEvaluators]
  );

  const isAgentStep = step === 'agent';
  const isEvaluatorsStep = step === 'evaluators';
  const isNameStep = step === 'name';
  const isConfirmStep = step === 'confirm';

  const agentNav = useListNavigation({
    items: agentItems,
    onSelect: item => {
      setConfig(c => ({ ...c, agent: item.id }));
      goNext();
    },
    onExit,
    isActive: isAgentStep,
  });

  const evaluatorsNav = useMultiSelectNavigation({
    items: evaluatorItems,
    getId: item => item.id,
    onConfirm: ids => {
      const names = ids.map(id => {
        const item = rawEvaluators.find(e => e.arn === id);
        return item?.name ?? id;
      });
      setConfig(c => ({ ...c, evaluators: ids, evaluatorNames: names }));
      goNext();
    },
    onExit: () => goBack(),
    isActive: isEvaluatorsStep,
    requireSelection: true,
  });

  useListNavigation({
    items: [{ id: 'confirm', title: 'Confirm' }],
    onSelect: () => onComplete(config),
    onExit: () => goBack(),
    isActive: isConfirmStep,
  });

  const helpText = isAgentStep
    ? HELP_TEXT.NAVIGATE_SELECT
    : isEvaluatorsStep
      ? 'Space toggle · Enter confirm · Esc back'
      : isNameStep
        ? HELP_TEXT.TEXT_INPUT
        : HELP_TEXT.CONFIRM_CANCEL;

  const headerContent = <StepIndicator steps={allSteps} currentStep={step} labels={STEP_LABELS} />;

  return (
    <Screen title="Run Batch Evaluation" onExit={onExit} helpText={helpText} headerContent={headerContent}>
      <Panel>
        {isAgentStep && (
          <WizardSelect
            title="Select agent to evaluate"
            description="Choose a deployed agent"
            items={agentItems}
            selectedIndex={agentNav.selectedIndex}
          />
        )}

        {isEvaluatorsStep && (
          <WizardMultiSelect
            title="Select evaluators"
            description="Choose evaluators to run against agent sessions"
            items={evaluatorItems}
            cursorIndex={evaluatorsNav.cursorIndex}
            selectedIds={evaluatorsNav.selectedIds}
          />
        )}

        {isNameStep && (
          <Box flexDirection="column">
            <Text dimColor>Optional — leave blank for auto-generated name.</Text>
            <TextInput
              key="name"
              prompt="Batch evaluation name"
              initialValue=""
              onSubmit={value => {
                setConfig(c => ({ ...c, name: value }));
                goNext();
              }}
              onCancel={() => goBack()}
            />
          </Box>
        )}

        {isConfirmStep && (
          <ConfirmReview
            fields={[
              { label: 'Agent', value: config.agent },
              { label: 'Evaluators', value: config.evaluatorNames.join(', ') },
              ...(config.name ? [{ label: 'Name', value: config.name }] : []),
            ]}
          />
        )}
      </Panel>
    </Screen>
  );
}

// ============================================================================
// Results View
// ============================================================================

function scoreColor(score: number): string {
  if (score >= 0.8) return 'green';
  if (score >= 0.5) return 'yellow';
  return 'red';
}

interface ResultsViewProps {
  result: RunBatchEvaluationCommandResult;
  onRunAnother: () => void;
  onExit: () => void;
}

function ResultsView({ result, onRunAnother, onExit }: ResultsViewProps) {
  const actions = [
    { id: 'another', title: 'Run another batch evaluation' },
    { id: 'back', title: 'Back' },
  ];

  const nav = useListNavigation({
    items: actions,
    onSelect: item => {
      if (item.id === 'another') onRunAnother();
      else onExit();
    },
    onExit,
    isActive: true,
  });

  // Group results by evaluator
  const byEvaluator = useMemo(() => {
    const map = new Map<string, BatchEvaluationResult[]>();
    for (const r of result.results) {
      const group = map.get(r.evaluatorId) ?? [];
      group.push(r);
      map.set(r.evaluatorId, group);
    }
    return map;
  }, [result.results]);

  return (
    <Screen title="Batch Evaluation Complete" onExit={onExit} helpText={HELP_TEXT.NAVIGATE_SELECT} exitEnabled={false}>
      <Panel fullWidth>
        <Box flexDirection="column">
          <Text color="green">✓ Batch evaluation complete</Text>
          <Text>
            <Text bold>ID:</Text> {result.batchEvaluateId}
            {'  '}
            <Text bold>Status:</Text> {result.status}
          </Text>
          {result.name && (
            <Text>
              <Text bold>Name:</Text> {result.name}
            </Text>
          )}

          {result.results.length > 0 ? (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Scores range from 0 (worst) to 1 (best).</Text>
              {[...byEvaluator.entries()].map(([evalId, evalResults]) => {
                const scores = evalResults.filter(r => !r.error).map(r => r.score!);
                const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                const errors = evalResults.filter(r => r.error).length;
                return (
                  <Text key={evalId}>
                    {'  '}
                    <Text bold>{evalId}</Text>
                    {'  '}
                    <Text color={scoreColor(avg)}>{avg.toFixed(2)}</Text>
                    {errors > 0 && <Text color="red"> ({errors} errors)</Text>}
                  </Text>
                );
              })}
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text dimColor>No evaluation results returned.</Text>
            </Box>
          )}

          {result.logFilePath && (
            <Box marginTop={1}>
              <Text dimColor>Log: {result.logFilePath}</Text>
            </Box>
          )}

          <Box marginTop={1} flexDirection="column">
            {actions.map((action, idx) => {
              const selected = idx === nav.selectedIndex;
              return (
                <Text key={action.id}>
                  <Text color={selected ? 'cyan' : undefined}>{selected ? '❯' : ' '} </Text>
                  <Text color={selected ? 'cyan' : undefined} bold={selected}>
                    {action.title}
                  </Text>
                </Text>
              );
            })}
          </Box>
        </Box>
      </Panel>
    </Screen>
  );
}
