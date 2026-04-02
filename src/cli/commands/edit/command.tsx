import { requireProject } from '../../tui/guards';
import { EditFlow } from '../../tui/screens/edit';
import type { Command } from '@commander-js/extra-typings';
import { render } from 'ink';
import React from 'react';

export function registerEdit(program: Command): Command {
  const editCmd = program
    .command('edit')
    .description('Edit AgentCore resources')
    .showHelpAfterError()
    .showSuggestionAfterError();

  editCmd
    .command('config-bundle')
    .description('Edit a configuration bundle')
    .action(() => {
      requireProject();

      const { clear, unmount } = render(
        <EditFlow
          isInteractive={false}
          initialResourceType="config-bundle"
          onExit={() => {
            clear();
            unmount();
          }}
          onBack={() => {
            clear();
            unmount();
          }}
        />
      );
    });

  // Default action when no subcommand is given — show resource selection
  editCmd.action((_options, cmd) => {
    // If extra arguments were passed, show help
    if (cmd.args.length > 0) {
      console.error(`error: '${cmd.args[0]}' is not a valid subcommand.`);
      cmd.outputHelp();
      process.exit(1);
    }

    requireProject();

    const { clear, unmount } = render(
      <EditFlow
        isInteractive={false}
        onExit={() => {
          clear();
          unmount();
        }}
        onBack={() => {
          clear();
          unmount();
        }}
      />
    );
  });

  return editCmd;
}
