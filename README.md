# Coding Pal

Instructions, skills, and agents to improve your AI coding assistant.

## Install with APM

To install this collection in an APM-enabled project, first create an `apm.yml` file:

```yml
# apm.yml — ships with your project
name: your-project
version: 1.0.0
author: your-name
targets:
- copilot
dependencies:
  apm: {}
  mcp: {}

```

Then install a package:

```bash
apm install ALTEN-group/coding-pal/instructions/sharp-agent.instructions.md --target copilot
```

This installs the `instructions/sharp-agent.instructions.md` file into your project so your coding assistant can use it.

Learn more about [**Agent Package Manager**](https://microsoft.github.io/apm/quickstart/)

