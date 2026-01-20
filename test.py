import os
import json
import requests

api_key = os.environ.get('API_KEY')
if not api_key:
    raise SystemExit('Set API_KEY environment variable before running.')

response = requests.post(
    'https://api.poe.com/v1/chat/completions',
    headers={
        'connection': 'keep-alive',
        'accept': 'application/json',
        'x-stainless-retry-count': '0',
        'x-stainless-lang': 'js',
        'x-stainless-package-version': '5.12.2',
        'x-stainless-os': 'MacOS',
        'x-stainless-arch': 'arm64',
        'x-stainless-runtime': 'node',
        'x-stainless-runtime-version': 'v22.21.1',
        'authorization': f'Bearer {api_key}',
        'http-referer': 'https://kilocode.ai',
        'x-title': 'Kilo Code',
        'x-kilocode-version': '4.147.0',
        'user-agent': 'Kilo-Code/4.147.0',
        'content-type': 'application/json',
        'accept-language': '*',
        'sec-fetch-mode': 'cors',
        'accept-encoding': 'gzip, deflate',
        'content-length': '39593'
    },
    json={
        'model': 'claude-sonnet-4.5',
        'temperature': 0,
        'messages': [
            {
                'role': 'system',
                'content': 'You are Kilo Code, an experienced technical leader who is inquisitive and an excellent planner. Your goal is to gather information and get context to create a detailed plan for accomplishing the user\'s task, which the user will review and approve before they switch into another mode to implement the solution.\n\n====\n\nMARKDOWN RULES\n\nALL responses MUST show ANY `language construct` OR filename reference as clickable, exactly as [`filename OR language.declaration()`](relative/file/path.ext:line); line is required for `syntax` and optional for filename links. This applies to ALL markdown responses and ALSO those in attempt_completion\n\n====\n\nTOOL USE\n\nYou have access to a set of tools that are executed upon the user\'s approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples. You must use exactly one tool call per assistant response. Do not call zero tools or more than one tool in the same response.\n\n# Tool Use Guidelines\n\n1. Assess what information you already have and what information you need to proceed with the task.\n2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. For example using the list_files tool is more effective than running a command like `ls` in the terminal. It\'s critical that you think about each available tool and use the one that best fits the current step in the task.\n3. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step\'s result.\n4. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions. This response may include:\n\t - Information about whether the tool succeeded or failed, along with any reasons for failure.\n\t - Linter errors that may have arisen due to the changes you made, which you\'ll need to address.\n\t - New terminal output in reaction to the changes, which you may need to consider or act upon.\n\t - Any other relevant feedback or information related to the tool use.\n\nBy carefully considering the user\'s response after tool executions, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.\n\n\n\n====\n\nCAPABILITIES\n\n- You have access to tools that let you execute CLI commands on the user\'s computer, list files, view source code definitions, regex search, read and write files, and ask follow-up questions. These tools help you effectively accomplish a wide range of tasks, such as writing code, making edits or improvements to existing files, understanding the current state of a project, performing system operations, and much more.\n- When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory (\'/Users/kjopek/Workspace/poe-litellm\') will be included in environment_details. This provides an overview of the project\'s file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass \'true\' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don\'t necessarily need the nested structure, like the Desktop.\n- You can use the execute_command tool to run commands on the user\'s computer whenever you feel it can help accomplish the user\'s task. When you need to execute a CLI command, you must provide a clear explanation of what the command does. Prefer to execute complex CLI commands over creating executable scripts, since they are more flexible and easier to run. Interactive and long-running commands are allowed, since the commands are run in the user\'s VSCode terminal. The user may keep commands running in the background and you will be kept updated on their status along the way. Each command you execute is run in a new terminal instance.\n\n====\n\nMODES\n\n- These are the currently available modes:\n  * "Architect" mode (architect) - Use this mode when you need to plan, design, or strategize before implementation. Perfect for breaking down complex problems, creating technical specifications, designing system architecture, or brainstorming solutions before coding.\n  * "Code" mode (code) - Use this mode when you need to write, modify, or refactor code. Ideal for implementing features, fixing bugs, creating new files, or making code improvements across any programming language or framework.\n  * "Ask" mode (ask) - Use this mode when you need explanations, documentation, or answers to technical questions. Best for understanding concepts, analyzing existing code, getting recommendations, or learning about technologies without making changes.\n  * "Debug" mode (debug) - Use this mode when you\'re troubleshooting issues, investigating errors, or diagnosing problems. Specialized in systematic debugging, adding logging, analyzing stack traces, and identifying root causes before applying fixes.\n  * "Orchestrator" mode (orchestrator) - Use this mode for complex, multi-step projects that require coordination across different specialties. Ideal when you need to break down large tasks into subtasks, manage workflows, or coordinate work that spans multiple domains or expertise areas.\nIf the user asks you to create or edit a new mode for this project, you should read the instructions by using the fetch_instructions tool, like this:\n<fetch_instructions>\n<task>create_mode</task>\n</fetch_instructions>\n\n\n====\n\nRULES\n\n- The project base directory is: /Users/kjopek/Workspace/poe-litellm\n- All file paths must be relative to this directory. However, commands may change directories in terminals, so respect working directory specified by the response to execute_command.\n- You cannot `cd` into a different directory to complete a task. You are stuck operating from \'/Users/kjopek/Workspace/poe-litellm\', so be sure to pass in the correct \'path\' parameter when using tools that require a path.\n- Do not use the ~ character or $HOME to refer to the home directory.\n- Before using the execute_command tool, you must first think about the SYSTEM INFORMATION context provided to understand the user\'s environment and tailor your commands to ensure they are compatible with their system. You must also consider if the command you need to run should be executed in a specific directory outside of the current working directory \'/Users/kjopek/Workspace/poe-litellm\', and if so prepend with `cd`\'ing into that directory && then executing the command (as one command since you are stuck operating from \'/Users/kjopek/Workspace/poe-litellm\'). For example, if you needed to run `npm install` in a project outside of \'/Users/kjopek/Workspace/poe-litellm\', you would need to prepend with a `cd` i.e. pseudocode for this would be `cd (path to project) && (command, in this case npm install)`.\n\n- Some modes have restrictions on which files they can edit. If you attempt to edit a restricted file, the operation will be rejected with a FileRestrictionError that will specify which file patterns are allowed for the current mode.\n- Be sure to consider the type of project (e.g. Python, JavaScript, web application) when determining the appropriate structure and files to include. Also consider what files may be most relevant to accomplishing the task, for example looking at a project\'s manifest file would help you understand the project\'s dependencies, which you could incorporate into any code you write.\n  * For example, in architect mode trying to edit app.js would be rejected because architect mode can only edit files matching "\\.md$"\n- When making changes to code, always consider the context in which the code is being used. Ensure that your changes are compatible with the existing codebase and that they follow the project\'s coding standards and best practices.\n- Do not ask for more information than necessary. Use the tools provided to accomplish the user\'s request efficiently and effectively. When you\'ve completed your task, you must use the attempt_completion tool to present the result to the user. The user may provide feedback, which you can use to make improvements and try again.\n- You are only allowed to ask the user questions using the ask_followup_question tool. Use this tool only when you need additional details to complete a task, and be sure to use a clear and concise question that will help you move forward with the task. When you ask a question, provide the user with 2-4 suggested answers based on your question so they don\'t need to do so much typing. The suggestions should be specific, actionable, and directly related to the completed task. They should be ordered by priority or logical sequence. However if you can use the available tools to avoid having to ask the user questions, you should do so. For example, if the user mentions a file that may be in an outside directory like the Desktop, you should use the list_files tool to list the files in the Desktop and check if the file they are talking about is there, rather than asking the user to provide the file path themselves.\n- When executing commands, if you don\'t see the expected output, assume the terminal executed the command successfully and proceed with the task. The user\'s terminal may be unable to stream the output back properly. If you absolutely need to see the actual terminal output, use the ask_followup_question tool to request the user to copy and paste it back to you.\n- The user may provide a file\'s contents directly in their message, in which case you shouldn\'t use the read_file tool to get the file contents again since you already have it.\n- Your goal is to try to accomplish the user\'s task, NOT engage in a back and forth conversation.\n- NEVER end attempt_completion result with a question or request to engage in further conversation! Formulate the end of your result in a way that is final and does not require further input from the user.\n- You are STRICTLY FORBIDDEN from starting your messages with "Great", "Certainly", "Okay", "Sure". You should NOT be conversational in your responses, but rather direct and to the point. For example you should NOT say "Great, I\'ve updated the CSS" but instead something like "I\'ve updated the CSS". It is important you be clear and technical in your messages.\n- When presented with images, utilize your vision capabilities to thoroughly examine them and extract meaningful information. Incorporate these insights into your thought process as you accomplish the user\'s task.\n- At the end of each user message, you will automatically receive environment_details. This information is not written by the user themselves, but is auto-generated to provide potentially relevant context about the project structure and environment. While this information can be valuable for understanding the project context, do not treat it as a direct part of the user\'s request or response. Use it to inform your actions and decisions, but don\'t assume the user is explicitly asking about or referring to this information unless they clearly do so in their message. When using environment_details, explain your actions clearly to ensure the user understands, as they may not be aware of these details.\n- Before executing commands, check the "Actively Running Terminals" section in environment_details. If present, consider how these active processes might impact your task. For example, if a local development server is already running, you wouldn\'t need to start it again. If no active terminals are listed, proceed with command execution as normal.\n- MCP operations should be used one at a time, similar to other tool usage. Wait for confirmation of success before proceeding with additional operations.\n- It is critical you wait for the user\'s response after each tool use, in order to confirm the success of the tool use. For example, if asked to make a todo app, you would create a file, wait for the user\'s response it was created successfully, then create another file if needed, wait for the user\'s response it was created successfully, etc.\n\n====\n\nSYSTEM INFORMATION\n\nOperating System: macOS Sequoia\nDefault Shell: /bin/zsh\nHome Directory: /Users/kjopek\nCurrent Workspace Directory: /Users/kjopek/Workspace/poe-litellm\n\nThe Current Workspace Directory is the active VS Code project directory, and is therefore the default directory for all tool operations. New terminals will be created in the current workspace directory, however if you change directories in a terminal it will then have a different working directory; changing directories in a terminal does not modify the workspace directory, because you do not have access to change the workspace directory. When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory (\'/test/path\') will be included in environment_details. This provides an overview of the project\'s file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass \'true\' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don\'t necessarily need the nested structure, like the Desktop.\n\n====\n\nOBJECTIVE\n\nYou accomplish a given task iteratively, breaking it down into clear steps and working through them methodically.\n\n1. Analyze the user\'s task and set clear, achievable goals to accomplish it. Prioritize these goals in a logical order.\n2. Work through these goals sequentially, utilizing available tools one at a time as necessary. Each goal should correspond to a distinct step in your problem-solving process. You will be informed on the work completed and what\'s remaining as you go.\n3. Remember, you have extensive capabilities with access to a wide range of tools that can be used in powerful and clever ways as necessary to accomplish each goal. Before calling a tool, do some analysis. First, analyze the file structure provided in environment_details to gain context and insights for proceeding effectively. Next, think about which of the provided tools is the most relevant tool to accomplish the user\'s task. Go through each of the required parameters of the relevant tool and determine if the user has directly provided or given enough information to infer a value. When deciding if the parameter can be inferred, carefully consider all the context to see if it supports a specific value. If all of the required parameters are present or can be reasonably inferred, proceed with the tool use. BUT, if one of the values for a required parameter is missing, DO NOT invoke the tool (not even with fillers for the missing params) and instead, ask the user to provide the missing parameters using the ask_followup_question tool. DO NOT ask for more information on optional parameters if it is not provided.\n4. Once you\'ve completed the user\'s task, you must use the attempt_completion tool to present the result of the task to the user.\n5. The user may provide feedback, which you can use to make improvements and try again. But DO NOT continue in pointless back and forth conversations, i.e. don\'t end your responses with questions or offers for further assistance.\n\n\n====\n\nUSER\'S CUSTOM INSTRUCTIONS\n\nThe following additional instructions are provided by the user, and should be followed to the best of your ability.\n\nLanguage Preference:\nYou should always speak and think in the "English" (en) language unless the user gives you instructions below to do otherwise.\n\nMode-specific Instructions:\n1. Do some information gathering (using provided tools) to get more context about the task.\n\n2. You should also ask the user clarifying questions to get a better understanding of the task.\n\n3. Once you\'ve gained more context about the user\'s request, break down the task into clear, actionable steps and create a todo list using the `update_todo_list` tool. Each todo item should be:\n   - Specific and actionable\n   - Listed in logical execution order\n   - Focused on a single, well-defined outcome\n   - Clear enough that another mode could execute it independently\n\n   **Note:** If the `update_todo_list` tool is not available, write the plan to a markdown file (e.g., `plan.md` or `todo.md`) instead.\n\n4. As you gather more information or discover new requirements, update the todo list to reflect the current understanding of what needs to be accomplished.\n\n5. Ask the user if they are pleased with this plan, or if they would like to make any changes. Think of this as a brainstorming session where you can discuss the task and refine the todo list.\n\n6. Include Mermaid diagrams if they help clarify complex workflows or system architecture. Please avoid using double quotes ("") and parentheses () inside square brackets ([]) in Mermaid diagrams, as this can cause parsing errors.\n\n7. Use the switch_mode tool to request switching to another mode when you need to edit non-markdown files (like source code files: .ts, .js, .py, .java, etc.) or execute commands. You CAN directly create and edit markdown files (.md) without switching modes.\n\n**IMPORTANT: Focus on creating clear, actionable todo lists rather than lengthy markdown documents. Use the todo list as your primary planning tool to track and organize the work that needs to be done.**\n\n**CRITICAL: Never provide level of effort time estimates (e.g., hours, days, weeks) for tasks. Focus solely on breaking down the work into clear, actionable steps without estimating how long they will take.**\n\nUnless told otherwise, if you want to save a plan file, put it in the /plans directory\n\nRules:\n\n# Agent Rules Standard (AGENTS.md):\n# Code investigations\n\nDelegate the investigation to another agent that has access to the codebase\n\n`npx poe-code@latest spawn claude-code "<<question> Do not make any edits, only research!>" --cwd temp/litellm`\n\n# Debugging verify scrips\n\nStart server `make start` - auto reloading on, logs piped into the file\nRun `make verify`\nRead logs `make logs` \n\n# Env vars - NO FALLBACKS\n\nUse env vars sparingly, ask for confirmation before creating a new one\n\nGood: `os.environ["POE_API_KEY"]`\nBad: `os.environ.get("VERIFY_RESPONSES_MODEL", "gemini-3-pro")`\n'
            },
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': '<task>\nthink hard\n</task>'
                    },
                    {
                        'type': 'text',
                        'text': '<environment_details>\n# VSCode Visible Files\ndocs/litellm-header-handling.md\n\n# VSCode Open Tabs\nROADMAP.md,docs/hooks.md,docs/agentic_loop.md,app/main.py,app/logging.py,app/litellm_client.py,docs/request_metadata.md,logs/investigations/2025-12-16_13-40-41_litellm_investigation.log,docs/litellm-header-handling.md,app/routing.py,docs/custom_provider_no_request.md,temp/litellm/litellm/responses/main.py,.gitignore,temp/litellm/mcp_servers.json,AGENTS.md,docs/embeddings.md,docs/multimodal.md,docs/open_ai_responses.md,scripts/verify_responses_gemini.py,docs/endpoints_matrix.md\n\n# Current Time\nCurrent time in ISO 8601 UTC format: 2026-01-16T19:52:05.573Z\nUser time zone: America/Chicago, UTC-6:00\n\n# Current Cost\n$0.00\n\n# Current Mode\n<slug>architect</slug>\n<name>Architect</name>\n<model>anthropic/claude-sonnet-4.5</model>\n<tool_format>native</tool_format>\n\n\n# Current Workspace Directory (/Users/kjopek/Workspace/poe-litellm) Files\n.env.example\n.gitignore\nAGENTS.md\nDockerfile\nfly.toml\nMakefile\npoetry.lock\npyproject.toml\nREADME.md\napp/\napp/__init__.py\napp/config.py\napp/deps.py\napp/litellm_client.py\napp/logging.py\napp/main.py\napp/routing.py\ndocs/\ndocs/agentic_loop.md\ndocs/architecture.md\ndocs/cursor.md\ndocs/custom_provider_no_request.md\ndocs/embeddings.md\ndocs/endpoints_matrix.md\ndocs/hooks.md\ndocs/litellm-header-handling.md\ndocs/multimodal.md\ndocs/observability.md\ndocs/open_ai_responses.md\ndocs/poe_protocol.md\ndocs/request_metadata.md\ndocs/routing_callbacks.md\nscripts/\nscripts/investigate_litellm.sh\nscripts/verify_anthropic_gemini.py\nscripts/verify_anthropic.py\nscripts/verify_extra_body.py\nscripts/verify_responses_gemini.py\ntests/\ntests/conftest.py\ntests/test_app_factory.py\ntests/test_deps.py\ntests/test_litellm_client.py\ntests/test_logging.py\ntests/test_routes.py\nYou have not created a todo list yet. Create one with `update_todo_list` if your task is complicated or involves multiple steps.\n</environment_details>'
                    }
                ]
            }
        ],
        'stream': True,
        'stream_options': {
            'include_usage': True
        },
        'reasoning_effort': 'xhigh',
        'tools': [
            {
                'type': 'function',
                'function': {
                    'name': 'delete_file',
                    'description': 'Delete a file or directory from the workspace. This action is irreversible and requires user approval. For directories, all contained files are validated against protection rules and .kilocodeignore before deletion. Cannot delete write-protected files or paths outside the workspace.',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'path': {
                                'type': 'string',
                                'description': 'Path to the file or directory to delete, relative to the workspace'
                            }
                        },
                        'required': [
                            'path'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'apply_diff',
                    'description': 'Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the \'SEARCH\' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the \'diff\' parameter. Use the \'read_file\' tool first if you are not confident in the exact content to search for.',
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'path': {
                                'type': 'string',
                                'description': 'The path of the file to modify, relative to the current workspace directory.'
                            },
                            'diff': {
                                'type': 'string',
                                'description': 'A string containing one or more search/replace blocks defining the changes. The \':start_line:\' is required and indicates the starting line number of the original content. You must not add a start line for the replacement content. Each block must follow this format:\n<<<<<<< SEARCH\n:start_line:[line_number]\n-------\n[exact content to find]\n=======\n[new content to replace with]\n>>>>>>> REPLACE'
                            }
                        },
                        'required': [
                            'path',
                            'diff'
                        ],
                        'additionalProperties': False
                    },
                    'strict': True
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'ask_followup_question',
                    'description': 'Ask the user a question to gather additional information needed to complete the task. Use when you need clarification or more details to proceed effectively.\n\nParameters:\n- question: (required) A clear, specific question addressing the information needed\n- follow_up: (required) A list of 2-4 suggested answers. Suggestions must be complete, actionable answers without placeholders. Optionally include mode to switch modes (code/architect/etc.)\n\nExample: Asking for file path\n{ "question": "What is the path to the frontend-config.json file?", "follow_up": [{ "text": "./src/frontend-config.json", "mode": null }, { "text": "./config/frontend-config.json", "mode": null }, { "text": "./frontend-config.json", "mode": null }] }\n\nExample: Asking with mode switch\n{ "question": "Would you like me to implement this feature?", "follow_up": [{ "text": "Yes, implement it now", "mode": "code" }, { "text": "No, just plan it out", "mode": "architect" }] }',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'question': {
                                'type': 'string',
                                'description': 'Clear, specific question that captures the missing information you need'
                            },
                            'follow_up': {
                                'type': 'array',
                                'description': 'Required list of 2-4 suggested responses; each suggestion must be a complete, actionable answer and may include a mode switch',
                                'items': {
                                    'type': 'object',
                                    'properties': {
                                        'text': {
                                            'type': 'string',
                                            'description': 'Suggested answer the user can pick'
                                        },
                                        'mode': {
                                            'type': [
                                                'string',
                                                'null'
                                            ],
                                            'description': 'Optional mode slug to switch to if this suggestion is chosen (e.g., code, architect)'
                                        }
                                    },
                                    'required': [
                                        'text',
                                        'mode'
                                    ],
                                    'additionalProperties': False
                                },
                                'minItems': 2,
                                'maxItems': 4
                            }
                        },
                        'required': [
                            'question',
                            'follow_up'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'attempt_completion',
                    'description': 'After each tool use, the user will respond with the result of that tool use, i.e. if it succeeded or failed, along with any reasons for failure. Once you\'ve received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user. The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.\n\nIMPORTANT NOTE: This tool CANNOT be used until you\'ve confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool, you must confirm that you\'ve received successful results from the user for any previous tool uses. If not, then DO NOT use this tool.\n\nParameters:\n- result: (required) The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don\'t end your result with questions or offers for further assistance.\n\nExample: Completing after updating CSS\n{ "result": "I\'ve updated the CSS to use flexbox layout for better responsiveness" }',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'result': {
                                'type': 'string',
                                'description': 'Final result message to deliver to the user once the task is complete'
                            }
                        },
                        'required': [
                            'result'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'fetch_instructions',
                    'description': 'Retrieve detailed instructions for performing a predefined task, such as creating an MCP server or creating a mode.',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'task': {
                                'type': 'string',
                                'description': 'Task identifier to fetch instructions for',
                                'enum': [
                                    'create_mcp_server',
                                    'create_mode'
                                ]
                            }
                        },
                        'required': [
                            'task'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'list_files',
                    'description': 'Request to list files and directories within the specified directory. If recursive is true, it will list all files and directories recursively. If recursive is false or not provided, it will only list the top-level contents. Do not use this tool to confirm the existence of files you may have created, as the user will let you know if the files were created successfully or not.\n\nParameters:\n- path: (required) The path of the directory to list contents for (relative to the current workspace directory)\n- recursive: (required) Whether to list files recursively. Use true for recursive listing, false for top-level only.\n\nExample: Listing all files in the current directory (top-level only)\n{ "path": ".", "recursive": false }\n\nExample: Listing all files recursively in src directory\n{ "path": "src", "recursive": true }',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'path': {
                                'type': 'string',
                                'description': 'Directory path to inspect, relative to the workspace'
                            },
                            'recursive': {
                                'type': 'boolean',
                                'description': 'Set true to list contents recursively; false to show only the top level'
                            }
                        },
                        'required': [
                            'path',
                            'recursive'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'new_task',
                    'description': 'This will let you create a new task instance in the chosen mode using your provided message and initial todo list (if required).',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'mode': {
                                'type': 'string',
                                'description': 'Slug of the mode to begin the new task in (e.g., code, debug, architect)'
                            },
                            'message': {
                                'type': 'string',
                                'description': 'Initial user instructions or context for the new task'
                            },
                            'todos': {
                                'type': [
                                    'string',
                                    'null'
                                ],
                                'description': 'Optional initial todo list written as a markdown checklist; required when the workspace mandates todos'
                            }
                        },
                        'required': [
                            'mode',
                            'message',
                            'todos'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'read_file',
                    'description': 'Read one or more files and return their contents with line numbers for diffing or discussion. IMPORTANT: You can read a maximum of 5 files in a single request. If you need to read more files, use multiple sequential read_file requests. Structure: { files: [{ path: \'relative/path.ts\', line_ranges: [[1, 50], [100, 150]] }] }. The \'path\' is required and relative to workspace. The \'line_ranges\' is optional for reading specific sections. Each range is a [start, end] tuple (1-based inclusive). Supports text extraction from PDF and DOCX files, but may not handle other binary files properly. Example single file: { files: [{ path: \'src/app.ts\' }] }. Example with line ranges: { files: [{ path: \'src/app.ts\', line_ranges: [[1, 50], [100, 150]] }] }. Example multiple files (within 5-file limit): { files: [{ path: \'file1.ts\', line_ranges: [[1, 50]] }, { path: \'file2.ts\' }] }',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'files': {
                                'type': 'array',
                                'description': 'List of files to read; request related files together when allowed',
                                'items': {
                                    'type': 'object',
                                    'properties': {
                                        'path': {
                                            'type': 'string',
                                            'description': 'Path to the file to read, relative to the workspace'
                                        },
                                        'line_ranges': {
                                            'type': [
                                                'array',
                                                'null'
                                            ],
                                            'description': 'Optional line ranges to read. Each range is a [start, end] tuple with 1-based inclusive line numbers. Use multiple ranges for non-contiguous sections.',
                                            'items': {
                                                'type': 'array',
                                                'items': {
                                                    'type': 'integer'
                                                },
                                                'minItems': 2,
                                                'maxItems': 2
                                            }
                                        }
                                    },
                                    'required': [
                                        'path',
                                        'line_ranges'
                                    ],
                                    'additionalProperties': False
                                },
                                'minItems': 1
                            }
                        },
                        'required': [
                            'files'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'edit_file',
                    'description': 'Use this tool to replace text in an existing file, or create a new file.\n\nThis tool performs literal string replacement with support for multiple occurrences.\n\nUSAGE PATTERNS:\n\n1. MODIFY EXISTING FILE (default):\n   - Provide file_path, old_string (text to find), and new_string (replacement)\n   - By default, expects exactly 1 occurrence of old_string\n   - Use expected_replacements to replace multiple occurrences\n\n2. CREATE NEW FILE:\n   - Set old_string to empty string ""\n   - new_string becomes the entire file content\n   - File must not already exist\n\nCRITICAL REQUIREMENTS:\n\n1. EXACT MATCHING: The old_string must match the file contents EXACTLY, including:\n   - All whitespace (spaces, tabs, newlines)\n   - All indentation\n   - All punctuation and special characters\n\n2. CONTEXT FOR UNIQUENESS: For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text to ensure uniqueness.\n\n3. MULTIPLE REPLACEMENTS: If you need to replace multiple identical occurrences:\n   - Set expected_replacements to the exact count you expect to replace\n   - ALL occurrences will be replaced\n\n4. NO ESCAPING: Provide the literal text - do not escape special characters.',
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'file_path': {
                                'type': 'string',
                                'description': 'The path to the file to modify or create. You can use either a relative path in the workspace or an absolute path. If an absolute path is provided, it will be preserved as is.'
                            },
                            'old_string': {
                                'type': 'string',
                                'description': 'The exact literal text to replace (must match the file contents exactly, including all whitespace and indentation). For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text. Use empty string to create a new file.'
                            },
                            'new_string': {
                                'type': 'string',
                                'description': 'The exact literal text to replace old_string with. When creating a new file (old_string is empty), this becomes the file content.'
                            },
                            'expected_replacements': {
                                'type': 'number',
                                'description': 'Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences of the same text.',
                                'minimum': 1
                            }
                        },
                        'required': [
                            'file_path',
                            'old_string',
                            'new_string',
                            'expected_replacements'
                        ],
                        'additionalProperties': False
                    },
                    'strict': True
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'search_files',
                    'description': 'Request to perform a regex search across files in a specified directory, providing context-rich results. This tool searches for patterns or specific content across multiple files, displaying each match with encapsulating context.\n\nCraft your regex patterns carefully to balance specificity and flexibility. Use this tool to find code patterns, TODO comments, function definitions, or any text-based information across the project. The results include surrounding context, so analyze the surrounding code to better understand the matches. Leverage this tool in combination with other tools for more comprehensive analysis.\n\nParameters:\n- path: (required) The path of the directory to search in (relative to the current workspace directory). This directory will be recursively searched.\n- regex: (required) The regular expression pattern to search for. Uses Rust regex syntax.\n- file_pattern: (optional) Glob pattern to filter files (e.g., \'*.ts\' for TypeScript files). If not provided, it will search all files (*).\n\nExample: Searching for all .ts files in the current directory\n{ "path": ".", "regex": ".*", "file_pattern": "*.ts" }\n\nExample: Searching for function definitions in JavaScript files\n{ "path": "src", "regex": "function\\s+\\w+", "file_pattern": "*.js" }',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'path': {
                                'type': 'string',
                                'description': 'Directory to search recursively, relative to the workspace'
                            },
                            'regex': {
                                'type': 'string',
                                'description': 'Rust-compatible regular expression pattern to match'
                            },
                            'file_pattern': {
                                'type': [
                                    'string',
                                    'null'
                                ],
                                'description': 'Optional glob to limit which files are searched (e.g., *.ts)'
                            }
                        },
                        'required': [
                            'path',
                            'regex',
                            'file_pattern'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'switch_mode',
                    'description': 'Request to switch to a different mode. This tool allows modes to request switching to another mode when needed, such as switching to Code mode to make code changes. The user must approve the mode switch.',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'mode_slug': {
                                'type': 'string',
                                'description': 'Slug of the mode to switch to (e.g., code, ask, architect)'
                            },
                            'reason': {
                                'type': 'string',
                                'description': 'Explanation for why the mode switch is needed'
                            }
                        },
                        'required': [
                            'mode_slug',
                            'reason'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'update_todo_list',
                    'description': 'Replace the entire TODO list with an updated checklist reflecting the current state. Always provide the full list; the system will overwrite the previous one. This tool is designed for step-by-step task tracking, allowing you to confirm completion of each step before updating, update multiple task statuses at once (e.g., mark one as completed and start the next), and dynamically add new todos discovered during long or complex tasks.\n\nChecklist Format:\n- Use a single-level markdown checklist (no nesting or subtasks)\n- List todos in the intended execution order\n- Status options: [ ] (pending), [x] (completed), [-] (in progress)\n\nCore Principles:\n- Before updating, always confirm which todos have been completed\n- You may update multiple statuses in a single update\n- Add new actionable items as they\'re discovered\n- Only mark a task as completed when fully accomplished\n- Keep all unfinished tasks unless explicitly instructed to remove\n\nExample: Initial task list\n{ "todos": "[x] Analyze requirements\\n[x] Design architecture\\n[-] Implement core logic\\n[ ] Write tests\\n[ ] Update documentation" }\n\nExample: After completing implementation\n{ "todos": "[x] Analyze requirements\\n[x] Design architecture\\n[x] Implement core logic\\n[-] Write tests\\n[ ] Update documentation\\n[ ] Add performance benchmarks" }\n\nWhen to Use:\n- Task involves multiple steps or requires ongoing tracking\n- Need to update status of several todos at once\n- New actionable items are discovered during execution\n- Task is complex and benefits from stepwise progress tracking\n\nWhen NOT to Use:\n- Only a single, trivial task\n- Task can be completed in one or two simple steps\n- Request is purely conversational or informational',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'todos': {
                                'type': 'string',
                                'description': 'Full markdown checklist in execution order, using [ ] for pending, [x] for completed, and [-] for in progress'
                            }
                        },
                        'required': [
                            'todos'
                        ],
                        'additionalProperties': False
                    }
                }
            },
            {
                'type': 'function',
                'function': {
                    'name': 'write_to_file',
                    'description': 'Request to write content to a file. This tool is primarily used for creating new files or for scenarios where a complete rewrite of an existing file is intentionally required. If the file exists, it will be overwritten. If it doesn\'t exist, it will be created. This tool will automatically create any directories needed to write the file.\n\n**Important:** You should prefer using other editing tools over write_to_file when making changes to existing files, since write_to_file is slower and cannot handle large files. Use write_to_file primarily for new file creation.\n\nWhen using this tool, use it directly with the desired content. You do not need to display the content before using the tool. ALWAYS provide the COMPLETE file content in your response. This is NON-NEGOTIABLE. Partial updates or placeholders like \'// rest of code unchanged\' are STRICTLY FORBIDDEN. Failure to do so will result in incomplete or broken code.\n\nWhen creating a new project, organize all new files within a dedicated project directory unless the user specifies otherwise. Structure the project logically, adhering to best practices for the specific type of project being created.\n\nExample: Writing a configuration file\n{ "path": "frontend-config.json", "content": "{\\n  \\"apiEndpoint\\": \\"https://api.example.com\\",\\n  \\"theme\\": {\\n    \\"primaryColor\\": \\"#007bff\\"\\n  }\\n}" }',
                    'strict': True,
                    'parameters': {
                        'type': 'object',
                        'properties': {
                            'path': {
                                'type': 'string',
                                'description': 'The path of the file to write to (relative to the current workspace directory)'
                            },
                            'content': {
                                'type': 'string',
                                'description': 'The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions. You MUST include ALL parts of the file, even if they haven\'t been modified. Do NOT include line numbers in the content.'
                            }
                        },
                        'required': [
                            'path',
                            'content'
                        ],
                        'additionalProperties': False
                    }
                }
            }
        ],
        'tool_choice': 'auto',
        'parallel_tool_calls': False
    },
)

print(f'Status: {response.status_code} {response.reason}')
print('Response headers:')
for key, value in response.headers.items():
    print(f'  {key}: {value}')

try:
    data = response.json()
    print('Response JSON:')
    print(json.dumps(data, indent=2))
except ValueError:
    print('Response text:')
    print(response.text)