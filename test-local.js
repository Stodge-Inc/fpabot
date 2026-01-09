#!/usr/bin/env node
// Local test script for Financial Analyst with detailed logging

require('dotenv').config({ path: '.env.local' });

const ClaudeClient = require('./financial-analyst/claude-client');
const tools = require('./financial-analyst/tools');
const { SYSTEM_PROMPT, TOOL_DEFINITIONS } = require('./financial-analyst/config');

const MAX_TOOL_ITERATIONS = 10;

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m'
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.bright}${'='.repeat(60)}${colors.reset}\n`);
}

async function testQuestion(question) {
  const claude = new ClaudeClient();

  logSection(`QUESTION: ${question}`);

  const messages = [{ role: 'user', content: question }];
  let iteration = 0;

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;

    log(colors.cyan, `[Iteration ${iteration}]`, 'Calling Claude...');

    const response = await claude.createMessageWithRetry({
      system: SYSTEM_PROMPT,
      messages,
      tools: TOOL_DEFINITIONS,
      max_tokens: 4096
    });

    log(colors.dim, '  stop_reason:', response.stop_reason);

    // Process response content
    for (const block of response.content) {
      if (block.type === 'text') {
        log(colors.green, '\n  [Claude Text]', '');
        console.log(colors.dim + '  ' + block.text.split('\n').join('\n  ') + colors.reset);
      }

      if (block.type === 'tool_use') {
        log(colors.yellow, `\n  [Tool Call]`, block.name);
        console.log(colors.dim + '  Input: ' + JSON.stringify(block.input, null, 2).split('\n').join('\n  ') + colors.reset);
      }
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          log(colors.magenta, `\n  [Executing]`, block.name);

          const result = await tools.execute(block.name, block.input);

          // Log tool result summary
          if (result.is_error) {
            log(colors.red, '  [Error]', result.error);
          } else {
            log(colors.green, '  [Result]', '');
            // Summarize result
            if (result.total_amount !== undefined) {
              console.log(colors.dim + `    total_amount: $${(result.total_amount/1000).toFixed(0)}K` + colors.reset);
            }
            if (result.row_count !== undefined) {
              console.log(colors.dim + `    row_count: ${result.row_count}` + colors.reset);
            }
            if (result.rollup_totals) {
              console.log(colors.dim + '    rollup_totals:' + colors.reset);
              for (const [key, val] of Object.entries(result.rollup_totals).slice(0, 5)) {
                console.log(colors.dim + `      ${key}: $${(val/1000).toFixed(0)}K` + colors.reset);
              }
              if (Object.keys(result.rollup_totals).length > 5) {
                console.log(colors.dim + `      ... and ${Object.keys(result.rollup_totals).length - 5} more` + colors.reset);
              }
            }
            if (result.monthly_totals) {
              console.log(colors.dim + '    monthly_totals:' + colors.reset);
              for (const [key, val] of Object.entries(result.monthly_totals)) {
                console.log(colors.dim + `      ${key}: $${(val/1000).toFixed(0)}K` + colors.reset);
              }
            }
            if (result.quarterly_totals) {
              console.log(colors.dim + '    quarterly_totals:' + colors.reset);
              for (const [key, val] of Object.entries(result.quarterly_totals)) {
                console.log(colors.dim + `      ${key}: $${(val/1000).toFixed(0)}K` + colors.reset);
              }
            }
            if (result.unique_values) {
              console.log(colors.dim + `    unique_values: ${result.unique_values.slice(0, 10).join(', ')}${result.unique_values.length > 10 ? '...' : ''}` + colors.reset);
            }
            if (result.chart_url) {
              console.log(colors.dim + `    chart_url: [generated]` + colors.reset);
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

    } else {
      // Final response
      logSection('FINAL RESPONSE');

      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      console.log(textContent);

      logSection('END');
      return textContent;
    }
  }

  console.log('Max iterations reached!');
}

// Get question from command line args or use default
const question = process.argv.slice(2).join(' ') || 'What were our hosting costs in 2025?';

testQuestion(question).catch(console.error);
