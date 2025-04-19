import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const commandRef = useRef<string>('');
  const currentDirRef = useRef<string>('');

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
      },
    });

    // Initialize addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // Open terminal in the container
    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Store references
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Helper to write the prompt with current directory
    const writePrompt = async () => {
      try {
        currentDirRef.current = await invoke<string>('get_current_directory');

        // Format the directory path for display
        let displayPath = currentDirRef.current;
        const homePath = /^\/Users\/[^/]+/.exec(displayPath);

        if (homePath) {
          displayPath = displayPath.replace(homePath[0], '~');
        }

        // Get base name of current directory
        const baseDir = displayPath.split('/').pop() || '';
        const prompt = `\x1b[1;32m${baseDir}\x1b[0m $ `;

        xterm.write(prompt);
      } catch (error) {
        xterm.write('$ ');
      }
    };

    // Write welcome message
    xterm.writeln('Welcome to Taurminal! 🚀');
    // Initial prompt
    writePrompt();

    const executeCommand = async (cmd: string) => {
      try {
        const result = await invoke<string>('execute_command', { command: cmd });

        // Normalize line endings and write each line properly
        const lines = result
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n');

        for (const line of lines) {
          if (line) xterm.writeln(line);
        }

        await writePrompt();
      } catch (error) {
        xterm.writeln(`Error: ${error}`);
        await writePrompt();
      }
    };

    const getTabCompletion = async () => {
      try {
        // Get current command
        const cmd = commandRef.current.trim();
        if (!cmd) return;

        // Get the word being completed
        const words = cmd.split(' ');
        let currentWordIndex = words.length - 1;
        let currentWord = words[currentWordIndex];

        // If the cursor is after a space, we're starting a new word
        if (cmd.endsWith(' ')) {
          currentWord = '';
          currentWordIndex += 1;
        }

        // Get suggestions from backend
        const suggestions = await invoke<string[]>('get_completion_suggestions', {
          partialCommand: currentWord,
          fullCommand: cmd
        });

        if (suggestions.length === 0) return;

        if (suggestions.length === 1) {
          // If there's only one suggestion, use it
          let completion = suggestions[0];

          // If this is not the first word, we need to handle relative paths
          if (currentWordIndex > 0) {
            // If the suggestion is already a full path, use it entirely
            if (completion.startsWith('/') || completion.startsWith('~')) {
              // Replace the current word entirely
              words[currentWordIndex] = completion;
              commandRef.current = words.join(' ');

              // Clear the current word on screen
              for (let i = 0; i < currentWord.length; i++) {
                xterm.write('\b \b');
              }

              // Write the new word
              xterm.write(completion);
            } else {
              // Just append the remaining part
              const suffix = completion.slice(currentWord.length);
              xterm.write(suffix);

              // If it's a directory, add a space
              if (completion.endsWith('/')) {
                words[currentWordIndex] = completion;
              } else {
                words[currentWordIndex] = completion + ' ';
                xterm.write(' ');
              }

              commandRef.current = words.join(' ');
            }
          } else {
            // For the first word (command), just complete it
            const suffix = completion.slice(currentWord.length);
            xterm.write(suffix + ' ');
            commandRef.current = completion + ' ';
          }
        } else {
          // Show all suggestions
          xterm.writeln('');

          // Display suggestions in columns
          const maxLength = Math.max(...suggestions.map(s => s.length)) + 2;
          const termWidth = Math.floor(xterm.cols / maxLength);

          for (let i = 0; i < suggestions.length; i += termWidth) {
            const row = suggestions.slice(i, i + termWidth);
            const line = row.map(s => s.padEnd(maxLength)).join('');
            xterm.writeln(line);
          }

          // Redisplay prompt and current command
          await writePrompt();
          xterm.write(commandRef.current);
        }
      } catch (error) {
        console.error('Tab completion error:', error);
      }
    };

    // Handle input
    xterm.onData((data) => {
      switch (data) {
        case '\r': // Enter
          if (commandRef.current.trim()) {
            xterm.write('\r\n');
            const command = commandRef.current;
            commandRef.current = '';
            executeCommand(command);
          } else {
            xterm.write('\r\n');
            writePrompt();
          }
          break;
        case '\t': // Tab
          getTabCompletion();
          break;
        case '\u0003': // Ctrl+C
          xterm.write('^C\r\n');
          commandRef.current = '';
          writePrompt();
          break;
        case '\u007F': // Backspace (DEL)
        case '\b': // Backspace (BS)
          if (commandRef.current.length > 0) {
            commandRef.current = commandRef.current.slice(0, -1);
            xterm.write('\b \b');
          }
          break;
        default:
          // Only handle printable characters
          if (data >= ' ' && data <= '~') {
            commandRef.current += data;
            xterm.write(data);
          }
          break;
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100vh',
        padding: '10px',
        backgroundColor: '#1e1e1e',
      }}
    />
  );
}
