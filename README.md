# Coding pal

Instructions, skills and agents to improve your AI coding assistant.

## Install with APM

To install these collection of custom agents, instructions and skills in an APM-enabled project, first create a yml file :

```yml
# apm.yml — ships with your project
name: Your-project
version: 1.0.0
author: xxx
targets:
- copilot
dependencies:
  apm:
  mcp:

```

then install a package :

```bash
apm install ALTEN-group/instructions/sharp-agent.instructions.md --target copilot
```

This will install the `instructions/sharp-agent.instructions.md` file into your .github folder so your coding assistant can load it directly.

Learn more about **Agent Package Manager** [here](https://microsoft.github.io/apm/quickstart/)

