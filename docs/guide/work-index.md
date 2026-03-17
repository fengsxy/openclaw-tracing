# Work Index

The Work Index (0-100) measures agent productivity per time window. It answers: **is the agent actually doing work, or just burning tokens?**

## Scoring

| Score | Status | Meaning |
|-------|--------|---------|
| 61-100 | **Working** | High tool call rate, efficient token usage |
| 26-60 | **Planning** | Moderate activity, reading/exploring |
| 1-25 | **Spinning** | High token usage but few tool calls |
| 0 | **Idle** | No activity in this window |

## Formula

```
Score = min(100,
  (min(tool_density, 5) / 5) × 50      # Tool density weight
  + (min(token_efficiency, 3) / 3) × 30  # Token efficiency weight
  + (has_subagents ? 20 : 0)              # Delegation bonus
)
```

Where:
- **Tool density** = `tool_calls / max(llm_calls, 1)` — how many tools per LLM round
- **Token efficiency** = `tool_calls / max(tokens / 1000, 0.1)` — tools per 1k tokens
- **Delegation bonus** = 20 points if subagents were spawned (delegation = productive)

Special case: if `llm_calls > 0` but `tool_calls = 0`, score is capped at 15 (spinning).

## Use cases

### Detecting spinning agents

An agent with Work Index consistently below 25 is likely:
- Stuck in a loop
- Generating long responses without taking action
- Failing silently (tool calls erroring out)

### Comparing agent strategies

Run the same task with different models or prompts, compare Work Index:
- Higher density = more efficient tool use
- Higher token efficiency = less wasted context

### Cost optimization

Agents with low token efficiency are spending tokens without results. Investigate:
```bash
openclaw traces:workindex --date 2026-03-12
```

Look for **Spinning** phases and check what the agent was doing during those windows.
