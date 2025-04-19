import { useEffect, useRef } from 'react';
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

    // Write welcome message
    xterm.writeln('Welcome to Taurminal! 🚀');
    xterm.write('$ ');

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

        xterm.write('$ ');
      } catch (error) {
        xterm.writeln(`Error: ${error}`);
        xterm.write('$ ');
      }
    };

    const getTabCompletion = async () => {
      try {
        // Get current command
        const cmd = commandRef.current.trim();
        if (!cmd) return;

        // Get the word being completed
        const words = cmd.split(' ');
        const currentWord = words[words.length - 1];

        // Get suggestions from backend
        const suggestions = await invoke<string[]>('get_completion_suggestions', {
          partialCommand: currentWord
        });

        if (suggestions.length === 0) return;

        if (suggestions.length === 1) {
          // If there's only one suggestion, use it
          const completion = suggestions[0].slice(currentWord.length);
          xterm.write(completion);
          commandRef.current += completion;
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
          xterm.write('$ ' + commandRef.current);
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
            xterm.write('\r\n$ ');
          }
          break;
        case '\t': // Tab
          getTabCompletion();
          break;
        case '\u0003': // Ctrl+C
          xterm.write('^C\r\n$ ');
          commandRef.current = '';
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
