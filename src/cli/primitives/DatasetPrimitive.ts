import { findConfigRoot } from '../../lib';
import { DatasetSchema } from '../../schema';
import type { AddDatasetOptions } from '../commands/add/types';
import { validateAddDatasetOptions } from '../commands/add/validate';
import { getErrorMessage } from '../errors';
import type { RemovalPreview, RemovalResult, SchemaChange } from '../operations/remove/types';
import { cliCommandRun } from '../telemetry/cli-command-run.js';
import { BasePrimitive } from './BasePrimitive';
import type { AddResult, AddScreenComponent, RemovableResource } from './types';
import type { Command } from '@commander-js/extra-typings';

/**
 * Represents a dataset that can be removed.
 */
export type RemovableDataset = RemovableResource;

/**
 * DatasetPrimitive handles all dataset add/remove operations.
 */
export class DatasetPrimitive extends BasePrimitive<AddDatasetOptions, RemovableDataset> {
  readonly kind = 'dataset';
  readonly label = 'Dataset';
  readonly primitiveSchema = DatasetSchema;

  async add(options: AddDatasetOptions): Promise<AddResult<{ datasetName: string }>> {
    try {
      const project = await this.readProjectSpec();

      this.checkDuplicate(project.datasets, options.name);

      const dataset = {
        name: options.name,
        ...(options.description && { description: options.description }),
      };

      project.datasets.push(dataset);
      await this.writeProjectSpec(project);

      return { success: true, datasetName: dataset.name };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  }

  async remove(datasetName: string): Promise<RemovalResult> {
    try {
      const project = await this.readProjectSpec();

      const datasetIndex = project.datasets.findIndex(d => d.name === datasetName);
      if (datasetIndex === -1) {
        return { success: false, error: `Dataset "${datasetName}" not found.` };
      }

      project.datasets.splice(datasetIndex, 1);
      await this.writeProjectSpec(project);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async previewRemove(datasetName: string): Promise<RemovalPreview> {
    const project = await this.readProjectSpec();

    const dataset = project.datasets.find(d => d.name === datasetName);
    if (!dataset) {
      throw new Error(`Dataset "${datasetName}" not found.`);
    }

    const summary: string[] = [`Removing dataset: ${datasetName}`];
    const schemaChanges: SchemaChange[] = [];

    const afterSpec = {
      ...project,
      datasets: project.datasets.filter(d => d.name !== datasetName),
    };

    schemaChanges.push({
      file: 'agentcore/agentcore.json',
      before: project,
      after: afterSpec,
    });

    return { summary, directoriesToDelete: [], schemaChanges };
  }

  async getRemovable(): Promise<RemovableDataset[]> {
    try {
      const project = await this.readProjectSpec();
      return project.datasets.map(d => ({ name: d.name }));
    } catch {
      return [];
    }
  }

  /**
   * Get list of existing dataset names.
   */
  async getAllNames(): Promise<string[]> {
    try {
      const project = await this.configIO.readProjectSpec();
      return project.datasets.map(d => d.name);
    } catch {
      return [];
    }
  }

  registerCommands(addCmd: Command, removeCmd: Command): void {
    addCmd
      .command('dataset')
      .description('Add a dataset to the project')
      .option('--name <name>', 'Dataset name [non-interactive]')
      .option('--description <description>', 'Dataset description [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]')
      .action(async (cliOptions: { name?: string; description?: string; json?: boolean }) => {
        if (!findConfigRoot()) {
          console.error('No agentcore project found. Run `agentcore create` first.');
          process.exit(1);
        }

        if (cliOptions.name || cliOptions.json) {
          // CLI mode
          await cliCommandRun('add.dataset', !!cliOptions.json, async () => {
            const validation = validateAddDatasetOptions({
              name: cliOptions.name ?? '',
              description: cliOptions.description,
            });

            if (!validation.valid) {
              throw new Error(validation.error);
            }

            const result = await this.add({
              name: cliOptions.name!,
              description: cliOptions.description,
            });

            if (!result.success) {
              throw new Error(result.error);
            }

            if (cliOptions.json) {
              console.log(JSON.stringify(result));
            } else {
              console.log(`Added dataset '${result.datasetName}'`);
            }

            return {};
          });
        } else {
          console.error('--name is required. Run with --help for usage.');
          process.exit(1);
        }
      });

    this.registerRemoveSubcommand(removeCmd);
  }

  addScreen(): AddScreenComponent {
    return null;
  }
}
