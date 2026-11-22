require 'json'
require 'fileutils'
require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require 'tmpdir'
require 'yaml'

class WorkflowsTest < Minitest::Test
  ROOT = File.expand_path('..', __dir__)
  LABELS = %w[1-think 2-plan 3-code 4-prove 5-release].freeze
  PHASES = %w[think plan code prove].freeze

  def setup
    @directory = Dir.mktmpdir('coding-pal-workflows-')
    bin = File.join(@directory, 'bin')
    Dir.mkdir(bin)
    %w[bash jq mkdir head tail awk grep uname cat rm tr sed chmod printf].each do |command|
      executable = ENV.fetch('PATH').split(File::PATH_SEPARATOR)
                      .map { |path| File.join(path, command) }
                      .find { |path| File.executable?(path) && !File.directory?(path) }
      raise "Required test tool is missing: #{command}" unless executable
      File.symlink(executable, File.join(bin, command))
    end
    mock = File.join(bin, 'gh')
    File.write(mock, "#!#{RbConfig.ruby}\nload #{File.join(__dir__, 'support/gh.rb').inspect}\n")
    File.chmod(0o755, mock)
    @environment = {
      'PATH' => bin, 'HOME' => @directory, 'LC_ALL' => 'C', 'RUBYOPT' => '-EUTF-8',
      'RUNNER_TEMP' => @directory,
      'GITHUB_REPOSITORY' => 'test-owner/test-repo',
      'GITHUB_SERVER_URL' => 'https://github.com',
      'GITHUB_RUN_ID' => '123',
      'GITHUB_STEP_SUMMARY' => File.join(@directory, 'summary'),
      'ISSUE_NUMBER' => '42', 'PR_NUMBER' => '99', 'PR_URL' => 'https://example.test/pr/99',
      'GITHUB_OUTPUT' => File.join(@directory, 'output'),
      'GITHUB_ENV' => File.join(@directory, 'environment'),
      'TEST_SCENARIO' => File.join(@directory, 'scenario.json'),
      'TEST_CALLS' => File.join(@directory, 'calls.jsonl'),
      'TEST_VIOLATIONS' => File.join(@directory, 'violations')
    }
    @actions_context = {
      'secrets.PIPELINE_GITHUB_TOKEN' => 'fake-test-token',
      'secrets.COPILOT_GITHUB_TOKEN' => 'fake-copilot-token',
      'github.token' => 'fake-github-token',
      'github.repository' => 'test-owner/test-repo',
      'github.repository_owner' => 'test-owner',
      'github.event.repository.name' => 'test-repo',
      'github.event.repository.default_branch' => 'main',
      'github.event.repository.private' => 'false',
      'github.event_name' => 'workflow_dispatch',
      'github.run_id' => '123',
      'inputs.issue_number' => '42',
      'inputs.pr_number' => '99',
      'inputs.workflow_run_id' => '',
      'inputs.project_title' => 'Test board',
      'inputs.fix_loop_limit' => '5',
      'inputs.base_ref' => 'main',
      'inputs.prove_base_sha' => 'base-sha',
      'inputs.release_merge_sha' => 'merge-sha',
      'inputs.release_started_at' => '2026-01-02T00:00:00Z',
      'inputs.release_sha' => '',
      'inputs.release_tag' => '',
      'inputs.deployment_workflow' => '',
      'inputs.deployment_paths' => '',
      'inputs.publish_workflow' => 'publish.yml',
      'inputs.deployment_event' => 'push',
      'inputs.engine_repo' => 'ALTEN-group/coding-pal',
      'inputs.engine_ref' => '',
      'vars.FLEET_REPOS' => '',
      'inputs.agent' => 'dead-code',
      'inputs.scope' => 'src/',
      'inputs.prompt' => '',
      'inputs.target' => 'all',
      'inputs.audit' => 'all',
      'inputs.dependency' => 'all',
      'env.ISSUE_NUMBER' => '42',
      'steps.release.outputs.release_sha' => '',
      'steps.release.outputs.release_tag' => '',
      'steps.release.outputs.held' => '',
      'steps.release.outputs.batch_members' => ''
    }
  end

  def teardown
    FileUtils.remove_entry(@directory) if @directory
  end

  def workflow(phase)
    YAML.load_file(File.join(ROOT, ".github/workflows/pipeline-#{phase}.yml"))
  end

  def steps(phase)
    workflow(phase).fetch('jobs').fetch(phase).fetch('steps')
  end

  def step(phase, id)
    steps(phase).find { |entry| entry['id'] == id } || raise("Missing #{phase} step #{id}")
  end

  def scenario(labels = [], comments: [], prs: [], queue: [], **extra)
    {
      'issue' => { 'labels' => labels.map { |name| { 'name' => name } },
                   'body' => '', 'comments' => comments.map { |body| { 'body' => body } } },
      'prs' => prs, 'queue' => queue
    }.merge(extra.transform_keys(&:to_s))
  end

  def resolve_actions_value(raw)
    text = raw.to_s
    return text unless text.include?('${{')

    text.gsub(/\$\{\{\s*(.*?)\s*\}\}/) do
      candidates = Regexp.last_match(1).split('||').map(&:strip)
      resolved = candidates.lazy.map { |expr| @actions_context[expr] }.find { |val| !val.nil? && !val.empty? }
      if resolved.nil?
        raise "Unmapped Actions expression #{Regexp.last_match(0)}" unless candidates.any? { |expr| @actions_context.key?(expr) }
        ''
      else
        resolved
      end
    end
  end

  def resolve_step_environment(entry)
    job_env = {}
    Dir.glob(File.join(ROOT, '.github/workflows/*.yml')).each do |path|
      YAML.load_file(path).fetch('jobs').each_value do |job|
        if Array(job['steps']).any? { |candidate| candidate['name'] == entry['name'] && candidate['id'] == entry['id'] }
          job_env = job.fetch('env', {})
        end
      end
    end
    job_env.merge(entry.fetch('env', {})).transform_values { |value| resolve_actions_value(value) }
  end

  def run_step(entry, data, environment = {}, success: true)
    script = entry.fetch('run')
    if entry['id'] == 'checkpoint' && script.include?('code-project-status.sh')
      status_script = status_step('code', 'Code').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
      File.write(File.join(@directory, 'code-project-status.sh'), status_script)
      data = { 'project' => project }.merge(data)
    end
    refute_includes script, '${{', 'Tested shell steps must take Actions expressions through env'
    File.write(@environment.fetch('TEST_SCENARIO'), JSON.generate(data))
    %w[GITHUB_OUTPUT GITHUB_ENV TEST_CALLS TEST_VIOLATIONS].each do |key|
      File.write(@environment.fetch(key), '')
    end
    declared = resolve_step_environment(entry)
    @stdout, stderr, status = Open3.capture3(
      @environment.merge(declared).merge(environment),
      File.join(@directory, 'bin/bash'), '--noprofile', '--norc', '-e', '-o', 'pipefail',
      stdin_data: script, chdir: @directory, unsetenv_others: true
    )
    assert_equal '', File.read(@environment.fetch('TEST_VIOLATIONS')), 'Unmocked GitHub operation attempted'
    assert_equal success, status.success?, "#{@stdout}\n#{stderr}"
    @calls = File.readlines(@environment.fetch('TEST_CALLS')).map { |line| JSON.parse(line) }
    File.readlines(@environment.fetch('GITHUB_OUTPUT')).to_h { |line| line.strip.split('=', 2) }
  end

  def dispatches
    @calls.select { |args| args.first(2) == %w[workflow run] }
  end

  def queue_issue(number, labels, timestamp = '2026-01-02T00:00:00Z')
    {
      'number' => number, 'createdAt' => '2025-01-01T00:00:00Z',
      'labels' => { 'nodes' => labels.map { |name| { 'name' => name } } },
      'timelineItems' => { 'nodes' => labels.map { |name| { 'label' => { 'name' => name }, 'createdAt' => timestamp } } }
    }
  end

  def test_all_embedded_shell_scripts_parse
    Dir.glob(File.join(ROOT, '.github/workflows/*.yml')).each do |path|
      YAML.load_file(path).fetch('jobs').each_value do |job|
        Array(job['steps']).each do |entry|
          next unless entry['run']
          refute_includes entry['run'], '${{', "#{path}: #{entry['name']} must take Actions expressions through env"
          _, error, status = Open3.capture3('bash', '-n', stdin_data: entry['run'])
          assert status.success?, "#{path}: #{entry['name']}\n#{error}"
          entry['run'].scan(/<<'([A-Z_]+)'\n(.*?)\n\1/m).each do |_, script|
            _, error, status = Open3.capture3('bash', '-n', stdin_data: script)
            assert status.success?, "#{path}: #{entry['name']} helper\n#{error}"
          end
        end

      end
    end
  end

  def test_copilot_and_github_credentials_are_separate
    workflows = (PHASES + %w[release]).map { |phase| workflow(phase) }
    workflows << YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml'))
    workflows.each do |current|
      triggers = current['on'] || current.fetch(true)
      secrets = triggers.fetch('workflow_call').fetch('secrets')
      assert secrets.key?('PIPELINE_GITHUB_TOKEN'), current.fetch('name')
      current.fetch('jobs').each_value do |job|
        assert_equal '${{ github.repository }}', job.dig('env', 'GH_REPO'), current.fetch('name')
        checkout_index = Array(job['steps']).index { |entry| entry['uses'].to_s.start_with?('actions/checkout@') }
        Array(job['steps']).each_with_index do |entry, index|
          environment = entry.fetch('env', {})
          if environment.key?('GH_TOKEN')
            assert_equal '${{ secrets.PIPELINE_GITHUB_TOKEN }}', environment.fetch('GH_TOKEN'), entry['name']
            if (checkout_index.nil? || index < checkout_index || entry['if'].to_s.include?('failure()')) &&
               entry.fetch('run', '').match?(/\bgh\s+(?!api\b)/)
              assert_equal '${{ github.repository }}', environment.fetch('GH_REPO'), entry['name']
            end
          end
          if entry.fetch('run', '').match?(/\bcopilot --/)
            assert_equal '${{ secrets.COPILOT_GITHUB_TOKEN }}', environment.fetch('COPILOT_GITHUB_TOKEN'), entry['name']
            assert_equal '${{ secrets.PIPELINE_GITHUB_TOKEN }}', environment.fetch('GH_TOKEN'), entry['name']
          end
          entry.fetch('with', {}).each_value do |value|
            refute_includes value.to_s, 'secrets.COPILOT_GITHUB_TOKEN'
          end
        end
      end
    end
    (PHASES + %w[release]).each do |phase|
      current = workflow(phase)
      triggers = current['on'] || current.fetch(true)
      assert triggers.dig('workflow_call', 'secrets', 'PIPELINE_GITHUB_TOKEN', 'required')
    end
    %w[code prove release].each do |phase|
      checkout = steps(phase).find { |entry| entry['uses'].to_s.start_with?('actions/checkout@') }
      assert_equal '${{ secrets.PIPELINE_GITHUB_TOKEN }}', checkout.dig('with', 'token')
    end
    audit = YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml'))
    triggers = audit['on'] || audit.fetch(true)
    assert triggers.dig('workflow_call', 'secrets', 'PIPELINE_GITHUB_TOKEN', 'required')
    checkout = audit.fetch('jobs').fetch('audit').fetch('steps').first
    assert_equal '${{ secrets.PIPELINE_GITHUB_TOKEN }}', checkout.dig('with', 'token')
  end

  def test_every_copilot_invocation_uses_expected_step_model
    expected_models = {
      'pipeline-think.yml: Fetch issue context and run Thinker agent' => ['${ISSUE_AI_MODEL:-claude-sonnet-5.5}', '${ISSUE_AI_MODEL:-claude-sonnet-5.5}'],
      'pipeline-plan.yml: Fetch issue context and run Planner agent' => ['${ISSUE_AI_MODEL:-claude-sonnet-5.5}', '${ISSUE_AI_MODEL:-claude-sonnet-5.5}'],
      'pipeline-code.yml: Run Code Agent to implement plan.md and prepare pr.md' => ['${ISSUE_AI_MODEL:-claude-sonnet-5.5}', '${ISSUE_AI_MODEL:-claude-sonnet-5.5}'],
      'pipeline-prove.yml: Run Prove validation and auto-remediation loop' => ['${ISSUE_AI_MODEL:-claude-sonnet-5.5}', '${ISSUE_AI_MODEL:-claude-sonnet-5.5}'],
      'audit-runner.yml: Run ${{ inputs.agent }} agent' => ['gemini-3.8-flash']
    }
    actual_models = Hash.new { |h, k| h[k] = [] }
    calls = []
    Dir.glob(File.join(ROOT, '.github/workflows/*.yml')).each do |path|
      YAML.load_file(path).fetch('jobs').each_value do |job|
        Array(job['steps']).each do |entry|
          entry.fetch('run', '').each_line do |line|
            next unless line.match?(/^\s*copilot\s/)
            calls << line
            step_key = "#{File.basename(path)}: #{entry['name']}"
            match = line.match(/^\s*copilot --model="([^"]+)"(?:\s|$)/)
            refute_nil match, step_key
            actual_models[step_key] << match[1]
            refute_match(/--(?:fusion-tier|auto-tier)\b/, line)
            if match[1].include?('ISSUE_AI_MODEL')
              assert_match(/--reasoning-effort="\$\{ISSUE_AI_EFFORT:-medium\}"/, line, step_key)
            else
              refute_match(/--reasoning-effort\b/, line, step_key)
            end
          end
        end
      end
    end
    assert_equal 9, calls.length
    assert_equal expected_models, actual_models
  end

  def test_shared_workflow_references_resolve_to_existing_files
    paths = Dir.glob(File.join(ROOT, '.github/workflows/*.yml'))
    if ENV['PROJECT_WORKFLOWS_ROOT']
      paths += Dir.glob(File.join(ENV.fetch('PROJECT_WORKFLOWS_ROOT'), '*/.github/workflows/*.yml'))
    end
    paths.uniq.each do |path|
      YAML.load_file(path).fetch('jobs').each_value do |job|
        reference = job['uses'].to_s
        prefix = 'ALTEN-group/coding-pal/'
        next unless reference.start_with?(prefix, './')
        relative = reference.delete_prefix(prefix).delete_prefix('./').split('@').first
        assert File.file?(File.join(ROOT, relative)), "#{path}: missing reusable workflow #{reference}"
      end
    end
    audits = Dir.glob(File.join(ROOT, '.github/workflows/*audit*.yml'))
    audits.each { |path| assert File.basename(path).start_with?('audit-') || File.basename(path) == 'harness-audits.yml', path }
  end

  def test_checkpoints_pause_only_at_the_requested_phase
    PHASES.each_with_index do |phase, index|
      LABELS.each do |label|
        output = run_step(step(phase, 'checkpoint'), scenario([label]))
        paused = label == LABELS[index]
        assert_equal paused.to_s, output.fetch('paused'), "#{phase} with #{label}"
        edits = @calls.select { |args| args.first(2) == %w[issue edit] }
        assert_equal paused ? 1 : 0, edits.length
        assert_empty(@calls.select { |args| args.first(2) == %w[issue comment] })
        if paused
          edit = edits.first
          refute edit.include?('--add-label')
          assert_equal '@me', edit[edit.index('--add-assignee') + 1]
          assert_equal LABELS + ["pause:#{phase}"], edit[edit.index('--remove-label') + 1].split(',')
        end
        assert_empty dispatches
      end
    end
  end

  def test_pause_directives_are_preserved
    PHASES.each do |phase|
      ["[pause:#{phase}]", "- [x] Pause after #{phase.capitalize}"].each do |body|
        data = scenario(['5-release'])
        data['issue']['body'] = body
        assert_equal 'true', run_step(step(phase, 'checkpoint'), data).fetch('paused')
      end
      data = scenario(['5-release'])
      data['issue']['body'] = "- [ ] Pause after #{phase.capitalize}"
      assert_equal 'false', run_step(step(phase, 'checkpoint'), data).fetch('paused')
    end
  end

  def test_pause_artifact_gates_prevent_downstream_workflows
    %w[think plan code].each do |phase|
      artifact = steps(phase).find { |entry| entry['uses'].to_s.start_with?('actions/upload-artifact@') }
      assert_includes artifact.fetch('if'), "steps.checkpoint.outputs.paused != 'true'"
    end
    gate = steps('think').find { |entry| entry['uses'].to_s.start_with?('actions/upload-artifact@') }.fetch('if')
    assert_includes gate, 'steps.resume.outputs.resumed_stage'
    %w[release_stage release start_release].each do |step_id|
      assert_includes step('prove', step_id).fetch('if'), "steps.checkpoint.outputs.paused != 'true'"
    end
    merge = steps('prove').find { |entry| entry['name'] == 'Verify validated revisions and merge' }
    assert_includes merge.fetch('if'), "steps.checkpoint.outputs.paused != 'true'"
  end

  def test_downstream_dispatch_requires_a_successful_handoff
    { 'think' => 'plan', 'plan' => 'code' }.each do |phase, next_phase|
      entries = steps(phase)
      artifact = step(phase, 'handoff')
      assert artifact.fetch('uses').start_with?('actions/upload-artifact@')
      assert_includes artifact.fetch('if'), "steps.checkpoint.outputs.paused != 'true'"
      dispatch = entries.find { |entry| entry['name'] == "Start #{next_phase.capitalize}" }
      assert_equal "steps.handoff.outcome == 'success'", dispatch.fetch('if')
      assert_operator entries.index(dispatch), :>, entries.index(artifact)
      run_step(dispatch, scenario, { 'RUN_ID' => '12345' })
      assert_equal [['workflow', 'run', "#{next_phase}.yml", '-f', 'workflow_run_id=12345']], dispatches
    end
  end

  def test_preparation_does_not_wait_for_delivery_or_other_issues
    LABELS.each do |label|
      data = scenario([label], queue: [queue_issue(1, ['1-think'])],
                      runs: [{ 'status' => 'in_progress' }],
                      prs: [{ 'number' => 100, 'headRefName' => 'feature/issue-7-work', 'labels' => [] }])
      output = run_step(step('think', 'resume'), data)
      assert_equal 'none', output.fetch('resumed_stage')
      assert_empty dispatches
      refute @calls.any? { |args| args.first(2) == %w[run list] || args.first(2) == %w[api graphql] }
    end
    %w[think plan].each do |phase|
      group = workflow(phase).dig('jobs', phase, 'concurrency', 'group')
      assert_includes group, '${{ inputs.issue_number'
    end
  end

  def test_review_pauses_do_not_restart_other_issues
    PHASES.each_with_index do |phase, index|
      output = run_step(step(phase, 'checkpoint'),
                        scenario([LABELS[index]], queue: [queue_issue(1, ['5-release'])]))
      assert_equal 'true', output.fetch('paused')
      assert_empty dispatches
    end
  end

  def test_code_exposes_prove_handoff_only_after_artifact_upload
    current = workflow('code')
    triggers = current['on'] || current.fetch(true)
    assert_equal '${{ jobs.code.outputs.continue_to_prove }}',
                 triggers.dig('workflow_call', 'outputs', 'continue_to_prove', 'value')
    assert_equal "${{ steps.handoff.outcome == 'success' }}",
                 current.dig('jobs', 'code', 'outputs', 'continue_to_prove')
    assert_includes step('code', 'handoff').fetch('if'), "steps.checkpoint.outputs.paused != 'true'"
    refute steps('code').reject { |entry| entry['id'] == 'resolve' }.any? { |entry| entry.fetch('run', '').include?('gh workflow run prove.yml') }
    refute steps('prove').any? { |entry| entry.fetch('run', '').include?('gh workflow run think.yml') }
  end

  def test_smart_resume_reuses_specs
    fifo = step('think', 'resume')
    LABELS.each do |label|
      output = run_step(fifo, scenario([label], comments: ['# Think: scope', '# Plan: steps']))
      expected = { '1-think' => 'none', '2-plan' => 'plan', '3-code' => 'code', '4-prove' => 'code', '5-release' => 'code' }.fetch(label)
      assert_equal expected, output.fetch('resumed_stage')
      if expected == 'code'
        assert_equal [['workflow', 'run', 'code.yml', '-f', 'issue_number=42']], dispatches
      elsif expected == 'plan'
        assert_equal "# Think: scope\n", File.read(File.join(@directory, 'specs/issue-42/think.md'))
        assert_empty dispatches
      else
        assert_empty dispatches
      end
    end
    assert_equal 'plan', run_step(fifo, scenario(['3-code'], comments: ['# Think: scope'])).fetch('resumed_stage')
    assert_equal 'none', run_step(fifo, scenario(['5-release'])).fetch('resumed_stage')
    plan_resolve = run_step(step('plan', 'resolve'), scenario(['2-plan'], comments: ['# Think: scope']), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'false', plan_resolve.fetch('skip')
    plan_missing = run_step(step('plan', 'resolve'), scenario(['2-plan'], comments: []), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', plan_missing.fetch('skip')
    assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches
    code_resolve = run_step(step('code', 'resolve'), scenario(['3-code'], comments: ['# Think: scope', '# Plan: steps']), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'false', code_resolve.fetch('skip')
    code_missing_plan = run_step(step('code', 'resolve'), scenario(['3-code'], comments: ['# Think: scope']), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', code_missing_plan.fetch('skip')
    assert_equal [['workflow', 'run', 'plan.yml', '-f', 'issue_number=42']], dispatches
    code_missing_think = run_step(step('code', 'resolve'), scenario(['5-release'], comments: []), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', code_missing_think.fetch('skip')
    assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches
    prove_resolve = run_step(step('prove', 'resolve'), scenario(['5-release'], prs: [{ 'number' => 99, 'headRefName' => 'feature/issue-42-test', 'labels' => [] }], pr: { 'number' => 99, 'state' => 'OPEN', 'headRefName' => 'feature/issue-42-test', 'baseRefName' => 'main', 'body' => '- **Closes:** #42', 'title' => 'feat: test' }), { 'INPUT_ISSUE_NUMBER' => '42', 'INPUT_PR_NUMBER' => '', 'RUN_ID' => '' })
    assert_equal 'false', prove_resolve.fetch('skip')

    # Reopened or re-thought issue: a newer # Think: invalidates an older # Plan:
    reopened_comments = ['# Think: v1', '# Plan: v1', '# Think: v2']
    assert_equal 'plan', run_step(fifo, scenario(['5-release'], comments: reopened_comments)).fetch('resumed_stage')
    assert_equal "# Think: v2\n", File.read(File.join(@directory, 'specs/issue-42/think.md'))
    assert_empty dispatches

    reopened_code = run_step(step('code', 'resolve'), scenario(['5-release'], comments: reopened_comments), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', reopened_code.fetch('skip')
    assert_equal [['workflow', 'run', 'plan.yml', '-f', 'issue_number=42']], dispatches
  end

  # Regression (#65): comments the pipeline posts itself (queued by single-flight, started by the chain, train
  # bookkeeping) must not be read as developer feedback, or the issue is reset to Think instead of being resumed.
  def test_own_pipeline_comments_do_not_reset_a_resumable_issue
    prs = [{ 'number' => 99, 'headRefName' => 'feature/issue-42-test', 'labels' => [] }]
    base = [
      'Started by the chain after #41 merged.',
      '# Think: scope', '# Plan: steps', 'Pull request opened for #42: https://example.test/pr/99',
      "\u26A0\uFE0F **Prove failed \u2014 returned to Code with `needs:developer`**\n\nFix-loop limit of 5 automatic remediation attempts reached on PR #99."
    ]
    [
      "# Queued\nIssue(s) #67 are already in flight, so this issue is marked `ready` instead of being coded on a stale main.",
      'Started by the chain (5.0.0) after #41 merged.',
      'Milestone train complete (no new version was needed). Closed out together with #41.',
      'Released together with #41 in v5.0.0: milestone train published.'
    ].each do |own_comment|
      comments = base + [own_comment]
      code_out = run_step(step('code', 'resolve'), scenario(['5-release'], comments: comments, prs: prs), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
      assert_equal 'true', code_out.fetch('skip'), own_comment
      assert_equal [['workflow', 'run', 'prove.yml', '-f', 'pr_number=99', '-f', 'issue_number=42']], dispatches, "resumed at Prove, not reset to Think after: #{own_comment[0, 30]}"
      assert_equal 'prove', run_step(step('think', 'resume'), scenario(['5-release'], comments: comments, prs: prs)).fetch('resumed_stage'), own_comment
    end

    # A real developer comment still resets the issue to Think.
    dev = run_step(step('code', 'resolve'), scenario(['5-release'], comments: base + ['Actually it still fails when reloading.'], prs: prs), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches
    assert_equal 'true', dev.fetch('skip')
  end

  def test_existing_pr_is_proven_only_for_release
    prs = [{ 'number' => 99, 'headRefName' => 'feature/issue-42-test', 'labels' => [] }]
    comments = ['# Think: scope', '# Plan: steps']
    %w[3-code 4-prove 5-release].each do |label|
      output = run_step(step('think', 'resume'), scenario([label], comments: comments, prs: prs))
      assert_equal label == '3-code' ? 'code' : 'prove', output.fetch('resumed_stage')
      if label != '3-code'
        assert_equal [['workflow', 'run', 'prove.yml', '-f', 'pr_number=99', '-f', 'issue_number=42']], dispatches
      else
        assert_equal [['workflow', 'run', 'code.yml', '-f', 'issue_number=42']], dispatches
      end

      code_out = run_step(step('code', 'resolve'), scenario([label], comments: comments, prs: prs), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
      if label != '3-code'
        assert_equal 'true', code_out.fetch('skip')
        assert_equal [['workflow', 'run', 'prove.yml', '-f', 'pr_number=99', '-f', 'issue_number=42']], dispatches
      else
        assert_equal 'false', code_out.fetch('skip')
        assert_empty dispatches
        assert @calls.any? { |args| args.first(3) == ['pr', 'edit', '99'] && args.include?('--remove-assignee') && args.include?('@me') }
      end
    end

    # Stale PR relative to a newer Think or Plan spec must not skip Code
    stale_plan_comments = ['# Think: v1', '# Plan: v1', 'Pull request opened for #42: https://example.test/pr/99', '# Think: v2', '# Plan: v2']
    assert_equal 'code', run_step(step('think', 'resume'), scenario(['5-release'], comments: stale_plan_comments, prs: prs)).fetch('resumed_stage')
    assert_equal [['workflow', 'run', 'code.yml', '-f', 'issue_number=42']], dispatches
    stale_pr_code_out = run_step(step('code', 'resolve'), scenario(['5-release'], comments: stale_plan_comments, prs: prs), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'false', stale_pr_code_out.fetch('skip')
    assert_empty dispatches

    [
      [{ 'number' => 99, 'headRefName' => 'feature/issue-42-test', 'mergeable' => 'CONFLICTING', 'labels' => [] }],
      [{ 'number' => 99, 'headRefName' => 'feature/issue-42-test', 'labels' => [{ 'name' => 'needs:rebase' }] }]
    ].each do |conflicting_prs|
      think_out = run_step(step('think', 'resume'), scenario(['5-release'], comments: comments, prs: conflicting_prs))
      assert_equal 'code', think_out.fetch('resumed_stage')
      assert_equal [['workflow', 'run', 'code.yml', '-f', 'issue_number=42']], dispatches

      code_out = run_step(step('code', 'resolve'), scenario(['5-release'], comments: comments, prs: conflicting_prs), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
      assert_equal 'false', code_out.fetch('skip')
      assert_empty dispatches
    end

    reopened_comments = [
      "# Think: Old Spec\n\nOld think body",
      "# Plan: Old Plan\n\nOld plan body",
      "Pull request opened for #42: https://example.test/pr/99",
      "# Prove: Old Prove\n\nOld prove body",
      "# Release report\n\n- Issue: #42",
      'Reopening: this still fails when reloading the level.'
    ]
    %w[3-code 4-prove 5-release].each do |trigger_label|
      code_reopened = run_step(step('code', 'resolve'), scenario([trigger_label], comments: reopened_comments), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
      assert_equal 'true', code_reopened.fetch('skip')
      assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches

      think_reopened = run_step(step('think', 'resume'), scenario([trigger_label], comments: reopened_comments))
      assert_equal 'none', think_reopened.fetch('resumed_stage')
      assert_empty dispatches
    end

    plan_reopened = run_step(step('plan', 'resolve'), scenario(['2-plan'], comments: reopened_comments), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', plan_reopened.fetch('skip')
    assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches

    audit_reopened_comments = [
      "✅ **Already Resolved on Base Branch**\n\nPreviously closed.",
      'Actually the dead export is still present in src/index.js.'
    ]
    code_audit_reopened = run_step(step('code', 'resolve'), scenario(%w[audit:dead-code 5-release], comments: audit_reopened_comments), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', code_audit_reopened.fetch('skip')
    assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches

    plan_audit_reopened = run_step(step('plan', 'resolve'), scenario(%w[audit:dead-code 2-plan], comments: audit_reopened_comments), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', plan_audit_reopened.fetch('skip')
    assert_equal [['workflow', 'run', 'think.yml', '-f', 'issue_number=42']], dispatches

    think_audit_reopened = run_step(step('think', 'resume'), scenario(%w[audit:dead-code 5-release], comments: audit_reopened_comments))
    assert_equal 'none', think_audit_reopened.fetch('resumed_stage')
    assert_empty dispatches

    reopened_after_think = reopened_comments + ["# Think: Revised Spec\n\nRevised think body"]
    think_after_new_think = run_step(step('think', 'resume'), scenario(['5-release'], comments: reopened_after_think))
    assert_equal 'plan', think_after_new_think.fetch('resumed_stage')
    assert_equal "# Think: Revised Spec\n\nRevised think body\n", File.read(File.join(@directory, 'specs/issue-42/think.md'))

    plan_after_new_think = run_step(step('plan', 'resolve'), scenario(['5-release'], comments: reopened_after_think), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'false', plan_after_new_think.fetch('skip')
    assert_equal "# Think: Revised Spec\n\nRevised think body\n", File.read('/tmp/specs/issue-42/think.md')

    code_after_new_think = run_step(step('code', 'resolve'), scenario(['5-release'], comments: reopened_after_think), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', code_after_new_think.fetch('skip')
    assert_equal [['workflow', 'run', 'plan.yml', '-f', 'issue_number=42']], dispatches

    reopened_after_plan = reopened_after_think + ["# Plan: Revised Plan\n\nRevised plan body"]
    think_after_new_plan = run_step(step('think', 'resume'), scenario(['5-release'], comments: reopened_after_plan))
    assert_equal 'code', think_after_new_plan.fetch('resumed_stage')
    assert_equal [['workflow', 'run', 'code.yml', '-f', 'issue_number=42']], dispatches

    code_after_new_plan = run_step(step('code', 'resolve'), scenario(['5-release'], comments: reopened_after_plan), { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'false', code_after_new_plan.fetch('skip')
    assert_empty dispatches
    assert_equal "# Think: Revised Spec\n\nRevised think body\n", File.read('/tmp/specs/issue-42/think.md')
    assert_equal "# Plan: Revised Plan\n\nRevised plan body\n", File.read('/tmp/specs/issue-42/plan.md')
  end

  def test_failures_remove_trigger_labels_without_restarting_other_issues
    PHASES.each do |phase|
      entry = steps(phase).find { |item| item['name'].to_s.match?(/(?:if #{phase.capitalize} fail|if #{phase.capitalize} failed)/) }
      refute_nil entry, phase
      run_step(entry, scenario([], queue: [queue_issue(7, ['1-think'])]))
      edit = @calls.find { |args| args.first(2) == %w[issue edit] }
      assert_equal 'needs:developer', edit[edit.index('--add-label') + 1]
      assert_equal LABELS, edit[edit.index('--remove-label') + 1].split(',')
      comment = @calls.find { |args| args.first(2) == %w[issue comment] }
      refute_nil comment, "#{phase} failure must post an explanatory comment on the issue"
      body = comment.include?('--body-file') ? File.read(comment[comment.index('--body-file') + 1]) : comment[comment.index('--body') + 1]
      assert_includes body, "⚠️ **#{phase.capitalize} failed"
      assert_includes body, 'needs:developer'
      assert_includes body, 'https://github.com/test-owner/test-repo/actions/runs/123'
      refute_includes body, 'Next steps:'
      assert_empty dispatches
    end
  end

  def project
    { 'data' => { 'repository' => {
      'issue' => {
        'id' => 'ISSUE',
        'issueFieldValues' => { 'nodes' => [] },
        'projectItems' => { 'nodes' => [{ 'id' => 'ITEM', 'project' => { 'id' => 'PROJECT' } }] }
      },
      'owner' => {
        'issueFields' => { 'nodes' => [
          {
            'id' => 'PRIORITY_FIELD', 'name' => 'Priority',
            'options' => %w[Urgent High Medium Low].map { |name| { 'name' => name, 'id' => "prio_#{name.downcase}" } }
          },
          {
            'id' => 'MODEL_FIELD', 'name' => 'Model',
            'options' => %w[claude-sonnet-5.5 claude-opus-5.5 claude-haiku-5.5 gpt-6.1-sol gpt-6.1-terra gpt-6-luna gpt-5.3-codex gemini-4-argon gemini-3.8-flash auto].map { |name| { 'name' => name, 'id' => "model_#{name}" } }
          },
          {
            'id' => 'EFFORT_FIELD', 'name' => 'Effort',
            'options' => %w[Max High Medium Low].map { |name| { 'name' => name, 'id' => "effort_#{name.downcase}" } }
          }
        ] },
        'projectsV2' => { 'nodes' => [{
          'id' => 'PROJECT', 'title' => 'Test board',
          'field' => { 'id' => 'STATUS', 'options' => %w[Triage Think Plan Code Prove Release Done].map { |name| { 'name' => name, 'id' => name.downcase } } }
        }] }
      }
    } } }
  end

  def status_step(phase, status)
    steps(phase).find { |entry| entry.dig('env', 'TARGET_STATUS') == status } || raise("Missing #{status}")
  end

  def test_status_updates_use_the_expected_project_and_option
    { 'think' => 'Think', 'plan' => 'Plan', 'code' => 'Code', 'prove' => 'Prove' }.each do |phase, status|
      entry = status_step(phase, status)
      run_step(entry, scenario([], project: project))
      update = @calls.find { |args| args.any? { |arg| arg.start_with?('query=') && arg.include?('updateProjectV2ItemFieldValue') } }
      refute_nil update
      %W[projectId=PROJECT itemId=ITEM fieldId=STATUS optionId=#{status.downcase}].each { |arg| assert_includes update, arg }
      field_sets = @calls.select { |args| args.any? { |arg| arg.include?('setIssueFieldValue') } }
      assert_equal 3, field_sets.length, "#{phase} must pre-select default Priority, Model, and Effort when unset"
      assert field_sets.any? { |args| args.include?('fieldId=PRIORITY_FIELD') && args.include?('fieldOptionId=prio_medium') }
      assert field_sets.any? { |args| args.include?('fieldId=MODEL_FIELD') && args.include?('fieldOptionId=model_claude-sonnet-5.5') }
      assert field_sets.any? { |args| args.include?('fieldId=EFFORT_FIELD') && args.include?('fieldOptionId=effort_medium') }
      env_vars = File.read(@environment.fetch('GITHUB_ENV'))
      assert_includes env_vars, 'ISSUE_AI_MODEL=claude-sonnet-5.5'
      assert_includes env_vars, 'ISSUE_AI_EFFORT=medium'
      assert_includes entry.fetch('if'), phase == 'think' ? "steps.resume.outputs.resumed_stage == 'none'" : "steps.resolve.outputs.skip != 'true'"
    end

    custom_project = project
    custom_project['data']['repository']['issue']['issueFieldValues']['nodes'] = [
      { 'value' => 'High', 'field' => { 'name' => 'Priority' } },
      { 'value' => 'claude-opus-5.5', 'field' => { 'name' => 'Model' } },
      { 'value' => 'Max', 'field' => { 'name' => 'Effort' } }
    ]
    run_step(status_step('think', 'Think'), scenario([], project: custom_project))
    assert_empty(@calls.select { |args| args.any? { |arg| arg.include?('setIssueFieldValue') } })
    custom_env = File.read(@environment.fetch('GITHUB_ENV'))
    assert_includes custom_env, 'ISSUE_AI_MODEL=claude-opus-5.5'
    assert_includes custom_env, 'ISSUE_AI_EFFORT=max'

    run_step(status_step('prove', 'Prove'), scenario([], project: custom_project, content_already_exists: true))
    assert @calls.any? { |args| args.include?('itemId=ITEM') && args.include?('optionId=prove') }
  end

  def test_project_status_matching_is_case_insensitive
    data = project
    board = data['data']['repository']['owner']['projectsV2']['nodes'].first
    board['title'] = 'TEST BOARD.js'
    board['field']['options'].each { |option| option['name'] = option['name'].downcase }
    run_step(status_step('think', 'Think'), scenario([], project: data))
    assert @calls.any? { |args| args.include?('optionId=think') }
  end

  def test_paused_code_keeps_code_status_and_removes_trigger_labels
    status_entries = steps('code').select { |entry| entry.dig('env', 'TARGET_STATUS') }
    assert_equal ['Code'], status_entries.map { |entry| entry.dig('env', 'TARGET_STATUS') }
    run_step(status_entries.first, scenario(['3-code'], project: project))
    assert @calls.any? { |args| args.include?('optionId=code') }

    output = run_step(step('code', 'checkpoint'), scenario(['3-code'], project: project))
    assert_equal 'true', output.fetch('paused')
    edit = @calls.find { |args| args.first(2) == %w[issue edit] }
    refute edit.include?('--add-label')
    assert_equal '@me', edit[edit.index('--add-assignee') + 1]
    assert_equal LABELS + ['pause:code'], edit[edit.index('--remove-label') + 1].split(',')
    assert @calls.any? { |args| args.include?('optionId=code') }
  end

  def test_status_configuration_and_permission_errors_are_explicit
    PHASES.each do |phase|
      status = { 'think' => 'Think', 'plan' => 'Plan', 'code' => 'Code', 'prove' => 'Prove' }.fetch(phase)
      entry = status_step(phase, status)
      data = scenario([], project: project)
      data['project']['data']['repository']['owner']['projectsV2']['nodes'][0]['field']['options'] = []
      run_step(entry, data, {}, success: false)
      assert_includes @stdout, '::error::'
      run_step(entry, scenario([], project: project, api_failure: true), {}, success: false)
      refute @calls.any? { |args| args.any? { |arg| arg.include?('mutation(') } }
      run_step(entry, scenario([]), { 'PROJECT_TITLE' => '' })
      assert_empty @calls
    end
  end

  def run_prove_loop(control_failures: 0, review_failures: 0, record_failures: 0, no_commit: false, success: true)
    entry = steps('prove').find { |item| item['name'] == 'Run Prove validation and auto-remediation loop' }.dup
    controls = <<~'BASH'
      run_deterministic_controls() {
        ROUND=$(( ${ROUND:-0} + 1 ))
        mkdir -p reports
        echo "checks:${ROUND}" >> "$RUNNER_TEMP/events"
        echo "exact check output round ${ROUND}" > gate-output.log
        [ "$ROUND" -gt "$TEST_CONTROL_FAILURES" ]
      }
      wait_for_pr_checks() {
        return 0
      }
    BASH
    entry['run'] = entry.fetch('run').sub(/run_deterministic_controls\(\) \{.*?\n\}/m, controls)
    mock = <<~'RUBY'
      count_path = File.join(ENV.fetch('RUNNER_TEMP'), 'fix-count')
      fixes = File.exist?(count_path) ? File.read(count_path).to_i : 0
      events = File.join(ENV.fetch('RUNNER_TEMP'), 'events')
      case File.basename($0)
      when 'git'
        puts "head-#{fixes}" if ARGV.first == 'rev-parse'
      when 'copilot'
        review = ARGV.include?('--agent=prove')
        File.open(events, 'a') { |f| f.puts(review ? 'review' : 'repair') }
        if review
          File.write('specs/issue-42/prove.md', "Independent review findings at head-#{fixes}")
        else
          report = File.read('reports/repair-attempt.md')
          File.write(File.join(ENV.fetch('RUNNER_TEMP'), "repair-#{fixes + 1}"), report)
          if ENV['TEST_NO_COMMIT'] == '1'
            puts 'Blocked: plan scope requires developer replanning'
          else
            File.write(count_path, (fixes + 1).to_s)
          end
        end
      when 'node'
        if ARGV.first.to_s.include?('validate-prove')
          review_path = File.join(ENV.fetch('RUNNER_TEMP'), 'review-count')
          reviews = File.exist?(review_path) ? File.read(review_path).to_i : 0
          File.write(review_path, (reviews + 1).to_s)
          if reviews < ENV.fetch('TEST_REVIEW_FAILURES').to_i
            warn 'Review verdict failed: missing acceptance criterion AC-2'
            exit 1
          end
        end
      end
    RUBY
    %w[copilot git node].each do |command|
      path = File.join(@directory, 'bin', command)
      File.write(path, "#!#{RbConfig.ruby}\n#{mock}")
      File.chmod(0o755, path)
    end
    status_script = status_step('prove', 'Prove').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
    File.write(File.join(@directory, 'prove-project-status.sh'), status_script)
    File.write(File.join(@directory, 'record-prove.sh'), <<~'BASH')
      RECORD_COUNT=0
      if [ -f "$RUNNER_TEMP/record-count" ]; then
        RECORD_COUNT=$(cat "$RUNNER_TEMP/record-count")
      fi
      echo $((RECORD_COUNT + 1)) > "$RUNNER_TEMP/record-count"
      if [ "$RECORD_COUNT" -lt "$TEST_RECORD_FAILURES" ]; then
        echo "PR metadata failed: rollback evidence missing"
        exit 1
      fi
    BASH
    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))
    File.write(File.join(@directory, 'specs/issue-42/prove.md'), 'STALE REVIEW')
    data = scenario([], project: project, pr: { 'labels' => [] }, track_fix_labels: true)
    run_step(entry, data, {
      'BASE_REF' => 'main', 'BRANCH_NAME' => 'issue-42', 'FIX_LOOP_LIMIT' => '5',
      'TEST_CONTROL_FAILURES' => control_failures.to_s, 'TEST_REVIEW_FAILURES' => review_failures.to_s,
      'TEST_RECORD_FAILURES' => record_failures.to_s, 'TEST_NO_COMMIT' => no_commit ? '1' : '0'
    }, success: success)
    File.readlines(File.join(@directory, 'events'), chomp: true)
  end

  def test_failed_checks_skip_review_and_return_to_code_with_exact_context
    assert_equal %w[checks:1 repair checks:2 review], run_prove_loop(control_failures: 1)
    report = File.read(File.join(@directory, 'repair-1'))
    assert_includes report, 'exact check output round 1'
    assert_includes report, 'Independent review deferred'
    refute_includes report, 'STALE REVIEW'
    assert_includes report, 'specs/issue-42/plan.md'
    assert_includes report, 'head-0'
    %w[issue pr].each do |target|
      assert @calls.any? { |args| args.first(2) == [target, 'comment'] && args.include?('reports/repair-attempt.md') },
             "Repair report must persist on the #{target}"
    end
    statuses = @calls.flat_map { |args| args.grep(/^optionId=/) }
    assert_equal %w[optionId=code optionId=prove], statuses
  end

  def test_failed_review_is_given_to_code_and_checks_run_again_before_review
    assert_equal %w[checks:1 review repair checks:2 review], run_prove_loop(review_failures: 1)
    report = File.read(File.join(@directory, 'repair-1'))
    assert_includes report, 'Independent review findings at head-0'
    assert_includes report, 'Review verdict failed: missing acceptance criterion AC-2'
  end

  def test_five_repairs_stop_without_review_or_merge_when_checks_keep_failing
    events = run_prove_loop(control_failures: 10, success: false)
    assert_equal 5, events.count('repair')
    assert_equal 6, events.count { |event| event.start_with?('checks:') }
    refute_includes events, 'review'
    assert @calls.any? { |args| args.first(2) == %w[issue edit] && args.include?('needs:developer') }
    assert @calls.any? { |args| args.first(2) == %w[issue comment] && args.include?('--body') && args.last.include?('⚠️ **Prove failed — returned to Code with `needs:developer`**') }
    refute @calls.any? { |args| args.first(2) == %w[pr merge] }
    assert_equal 'optionId=code', @calls.flat_map { |args| args.grep(/^optionId=/) }.last
    assert File.exist?(File.join(@directory, 'prove-failure-reported'))
  end

  def test_no_commit_repair_stops_immediately_and_reports_agent_output
    events = run_prove_loop(control_failures: 10, no_commit: true, success: false)
    assert_equal %w[checks:1 repair], events
    repair_comments = @calls.select { |args| args.first(2) == %w[issue comment] && args.include?('reports/repair-attempt.md') }
    assert_equal 1, repair_comments.length, 'Must not post repeated repair request comments when gate-fix produces no commit'
    handoff = @calls.find { |args| args.first(2) == %w[issue comment] && args.include?('--body') && args.last.include?('⚠️ **Prove failed — returned to Code with `needs:developer`**') }
    refute_nil handoff
    assert_includes handoff.last, 'produced no new commit on PR #99'
    assert_includes handoff.last, 'Blocked: plan scope requires developer replanning'
    assert File.exist?(File.join(@directory, 'prove-failure-reported'))
  end

  def test_final_pr_metadata_failure_also_returns_to_code_with_context
    assert_equal %w[checks:1 review repair checks:2 review], run_prove_loop(record_failures: 1)
    assert_includes File.read(File.join(@directory, 'repair-1')), 'PR metadata failed: rollback evidence missing'
  end

  def test_release_starts_only_after_validation_and_before_merge
    entries = steps('prove')
    validate = entries.index { |entry| entry['name'] == 'Run Prove validation and auto-remediation loop' }
    release = entries.index(status_step('prove', 'Release'))
    merge = entries.index { |entry| entry['name'] == 'Verify validated revisions and merge' }
    assert_operator release, :>, validate
    assert_operator release, :<, merge
    refute_match(/always\(|failure\(/, entries.fetch(release).fetch('if'))
    create = steps('code').find { |entry| entry.fetch('run', '').include?('gh pr create') }.fetch('run')
    assert_operator create.index('TARGET_STATUS=Prove'), :<, create.index('gh pr create')
  end

  def run_pr_checks(rollups, success: true)
    prove_entry = steps('prove').find { |entry| entry['name'] == 'Run Prove validation and auto-remediation loop' }
    script = prove_entry.fetch('run')
    function = script.match(/wait_for_pr_checks\(\) \{.*?\n\}/m)[0]
    sleep_path = File.join(@directory, 'bin/sleep')
    File.write(sleep_path, "#!#{RbConfig.ruby}\nexit 0\n")
    File.chmod(0o755, sleep_path)
    run_step(prove_entry.merge('run' => "#{function}\nwait_for_pr_checks\n"),
             scenario([], pr_sequence: rollups.map { |rollup| { 'statusCheckRollup' => rollup } }),
             { 'GITHUB_RUN_ID' => '123' }, success: success)
  end

  def test_pr_checks_wait_for_pending_ci_and_ignore_current_delivery_run
    own = { '__typename' => 'CheckRun', 'status' => 'IN_PROGRESS',
            'detailsUrl' => 'https://github.com/test/repo/actions/runs/123/job/456' }
    ci = { '__typename' => 'CheckRun', 'name' => 'test-and-build', 'status' => 'IN_PROGRESS',
           'detailsUrl' => 'https://github.com/test/repo/actions/runs/321/job/654' }
    run_pr_checks([[own, ci], [own, ci.merge('status' => 'COMPLETED', 'conclusion' => 'SUCCESS')]])
    assert_equal 2, @calls.count { |args| args.first(2) == %w[pr view] }
  end

  def test_failed_ci_and_external_status_block_independent_review
    [
      { '__typename' => 'CheckRun', 'status' => 'COMPLETED', 'conclusion' => 'FAILURE',
        'name' => 'tests', 'detailsUrl' => 'https://example.test/ci' },
      { '__typename' => 'StatusContext', 'state' => 'ERROR', 'context' => 'external CI',
        'targetUrl' => 'https://example.test/ci' }
    ].each do |check|
      run_pr_checks([[check]], success: false)
      assert_includes @stdout, 'GitHub PR checks failed'
      assert_includes @stdout, 'https://example.test/ci'
    end
  end

  def test_repositories_without_pr_checks_allow_registration_grace_period
    run_pr_checks([[], [], [], []])
    assert_equal 4, @calls.count { |args| args.first(2) == %w[pr view] }
  end

  def test_done_is_success_gated_and_after_release_preparation
    prove_entries = steps('prove')
    start_release = prove_entries.find { |entry| entry['id'] == 'start_release' }
    assert_operator prove_entries.index(start_release), :>, prove_entries.index { |entry| entry['name'].to_s.start_with?('Release merged service version') }
    entries = steps('release')
    done = status_step('release', 'Done')
    refute_match(/always\(|failure\(/, done.fetch('if'))
    assert_operator entries.index(done), :>, entries.index { |entry| entry['id'] == 'release_completion' }
    assert_includes done.fetch('if'), "steps.release_completion.outcome == 'success'"
    run_step(done, scenario([], project: project))
    assert @calls.any? { |args| args.include?('optionId=done') }
  end

  def test_done_auto_archives_items_beyond_forty_latest_while_leaving_other_columns_untouched
    base_time = Time.now.utc
    older_ts = (base_time - (5 * 86_400)).strftime('%Y-%m-%dT%H:%M:%SZ')
    oldest_ts = (base_time - (6 * 86_400)).strftime('%Y-%m-%dT%H:%M:%SZ')
    recent_done_nodes = (1..39).map do |idx|
      ts = (base_time - (idx * 3600)).strftime('%Y-%m-%dT%H:%M:%SZ')
      {
        'id' => "DONE_RECENT_#{idx}",
        'isArchived' => false,
        'updatedAt' => ts,
        'fieldValueByName' => { 'name' => 'Done', 'optionId' => 'done' },
        'content' => { 'closedAt' => ts, 'updatedAt' => ts }
      }
    end
    board_with_items = project
    board_with_items['data']['repository']['owner']['projectsV2']['nodes'][0]['items'] = {
      'nodes' => [
        {
          'id' => 'DONE_STALE_CLOSED',
          'isArchived' => false,
          'updatedAt' => older_ts,
          'fieldValueByName' => { 'name' => 'Done', 'optionId' => 'done' },
          'content' => { 'closedAt' => older_ts, 'updatedAt' => older_ts }
        },
        {
          'id' => 'DONE_STALE_UPDATED_FALLBACK',
          'isArchived' => false,
          'updatedAt' => oldest_ts,
          'fieldValueByName' => { 'name' => 'Done', 'optionId' => 'done' },
          'content' => {}
        },
        *recent_done_nodes,
        {
          'id' => 'DONE_ALREADY_ARCHIVED',
          'isArchived' => true,
          'updatedAt' => oldest_ts,
          'fieldValueByName' => { 'name' => 'Done', 'optionId' => 'done' },
          'content' => { 'closedAt' => oldest_ts, 'updatedAt' => oldest_ts }
        },
        {
          'id' => 'TRIAGE_STALE',
          'isArchived' => false,
          'updatedAt' => oldest_ts,
          'fieldValueByName' => { 'name' => 'Triage', 'optionId' => 'triage' },
          'content' => { 'updatedAt' => oldest_ts }
        },
        {
          'id' => 'CODE_STALE',
          'isArchived' => false,
          'updatedAt' => oldest_ts,
          'fieldValueByName' => { 'name' => 'Code', 'optionId' => 'code' },
          'content' => { 'updatedAt' => oldest_ts }
        },
        {
          'id' => 'ITEM',
          'isArchived' => false,
          'updatedAt' => oldest_ts,
          'fieldValueByName' => { 'name' => 'Done', 'optionId' => 'done' },
          'content' => { 'closedAt' => oldest_ts, 'updatedAt' => oldest_ts }
        }
      ]
    }

    # 1. Release Done step keeps 40 latest Done items (current ITEM + 39 newest) and archives older overflow Done items
    done_step = status_step('release', 'Done')
    run_step(done_step, scenario([], project: board_with_items))
    archived_in_release = @calls.select { |args| args.any? { |arg| arg.include?('archiveProjectV2Item') } }
                                .flat_map { |args| args.grep(/^itemId=/) }
    assert_equal %w[itemId=DONE_STALE_CLOSED itemId=DONE_STALE_UPDATED_FALLBACK], archived_in_release

    # 2. Prove status helper archives overflow Done items only when TARGET_STATUS=Done
    prove_status = status_step('prove', 'Prove')
    run_step(prove_status, scenario([], project: board_with_items), { 'TARGET_STATUS' => 'Prove' })
    assert_empty(@calls.select { |args| args.any? { |arg| arg.include?('archiveProjectV2Item') } })

    run_step(prove_status, scenario([], project: board_with_items), { 'TARGET_STATUS' => 'Done' })
    archived_in_prove = @calls.select { |args| args.any? { |arg| arg.include?('archiveProjectV2Item') } }
                              .flat_map { |args| args.grep(/^itemId=/) }
    assert_equal %w[itemId=DONE_STALE_CLOSED itemId=DONE_STALE_UPDATED_FALLBACK], archived_in_prove

    # 3. Plan status step exports STALE_DONE_ITEMS and already_resolved archives them when closing as Done
    plan_status = status_step('plan', 'Plan')
    run_step(plan_status, scenario([], project: board_with_items))
    env_vars = File.read(@environment.fetch('GITHUB_ENV'))
    assert_includes env_vars, 'STALE_DONE_ITEMS=DONE_STALE_CLOSED DONE_STALE_UPDATED_FALLBACK'

    already_resolved = step('plan', 'already_resolved')
    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))
    File.write(File.join(@directory, 'specs/issue-42/already-resolved.json'), JSON.generate({
      'resolved' => true,
      'summary' => 'Already resolved on base branch.'
    }))
    run_step(already_resolved, scenario(%w[5-release], project: board_with_items), {
      'PROJECT_ID' => 'PROJECT', 'PROJECT_ITEM_ID' => 'ITEM', 'STATUS_FIELD_ID' => 'STATUS',
      'DONE_OPTION_ID' => 'done', 'STALE_DONE_ITEMS' => 'DONE_STALE_CLOSED DONE_STALE_UPDATED_FALLBACK'
    })
    archived_in_plan = @calls.select { |args| args.any? { |arg| arg.include?('archiveProjectV2Item') } }
                             .flat_map { |args| args.grep(/^itemId=/) }
    assert_equal %w[itemId=DONE_STALE_CLOSED itemId=DONE_STALE_UPDATED_FALLBACK], archived_in_plan
  end

  def release_run(sha, event, status: 'completed', conclusion: 'success', id: 101, created: '2026-01-02T00:00:01Z')
    {
      'id' => id, 'head_sha' => sha, 'event' => event, 'status' => status,
      'conclusion' => conclusion, 'created_at' => created,
      'html_url' => "https://example.test/actions/runs/#{id}"
    }
  end

  def release_environment
    {
      'RELEASE_STARTED_AT' => '2026-01-02T00:00:00Z', 'RELEASE_MERGE_SHA' => 'merge-sha',
      'RELEASE_SHA' => '', 'RELEASE_TAG' => '', 'DEPLOYMENT_WORKFLOW' => '', 'DEPLOYMENT_PATHS' => '',
      'BASE_REF' => 'main', 'PROVE_BASE_SHA' => 'base-sha', 'GITHUB_REPOSITORY' => 'test-owner/test-repo',
      'GITHUB_SERVER_URL' => 'https://github.com', 'GITHUB_RUN_ID' => '123',
      'GITHUB_STEP_SUMMARY' => File.join(@directory, 'summary')
    }
  end

  def run_release_completion(runs, environment = {}, success: true, api_failure: false)
    %w[git sleep].each do |command|
      executable = File.join(@directory, 'bin', command)
      File.write(executable, "#!#{RbConfig.ruby}\nexit 0\n")
      File.chmod(0o755, executable)
    end
    entry = step('release', 'release_completion')
    data = scenario([], release_runs: runs, release_api_failure: api_failure)
    run_step(entry, data, release_environment.merge(environment), success: success)
    File.read(File.join(@directory, 'reports/release.md'))
  end

  def test_deployment_waits_for_exact_merge_push_not_an_unrelated_success
    wrong_sha = release_run('older-sha', 'push')
    wrong_event = release_run('merge-sha', 'workflow_dispatch', id: 102)
    stale = release_run('merge-sha', 'push', id: 103, created: '2026-01-01T00:00:00Z')
    pending = release_run('merge-sha', 'push', id: 104, status: 'in_progress', conclusion: nil)
    success = pending.merge('status' => 'completed', 'conclusion' => 'success')
    report = run_release_completion(
      { 'deploy-pages.yml' => [[wrong_sha, wrong_event, stale], [pending], [success]] },
      { 'DEPLOYMENT_WORKFLOW' => 'deploy-pages.yml' }
    )
    assert_includes report, 'https://example.test/actions/runs/104'
    assert_includes report, 'All required release workflows succeeded'
    polls = @calls.select { |args| args.first == 'api' }
    assert_equal 3, polls.length
    assert polls.all? { |args| args[1].include?('head_sha=merge-sha') }
    assert_empty dispatches
    %w[issue pr].each do |target|
      assert @calls.any? { |args| args.first(2) == [target, 'comment'] && args.include?('reports/release.md') }
    end
  end

  def test_service_waits_for_publish_workflow_and_documentation_at_release_revision
    report = run_release_completion({
      'publish.yml' => [[release_run('release-sha', 'release')]],
      'deploy-docs.yml' => [[release_run('release-sha', 'push', id: 102)]]
    }, { 'RELEASE_SHA' => 'release-sha', 'RELEASE_TAG' => 'v1.2.3', 'DEPLOYMENT_WORKFLOW' => 'deploy-docs.yml' })
    assert_includes report, 'GitHub Release: v1.2.3'
    assert_includes report, 'publish.yml'
    assert_includes report, 'deploy-docs.yml'
    assert_includes report, 'All required release workflows succeeded'
    assert_equal 2, @calls.count { |args| args.first == 'api' }
  end

  def test_failed_cancelled_or_skipped_release_does_not_pass
    %w[failure cancelled skipped timed_out action_required].each do |conclusion|
      report = run_release_completion(
        { 'publish.yml' => [[release_run('release-sha', 'release', conclusion: conclusion)]] },
        { 'RELEASE_SHA' => 'release-sha', 'RELEASE_TAG' => 'v1.2.3' }, success: false
      )
      assert_includes report, conclusion
      assert_includes report, 'Issue stays in Release'
      assert_includes report, 'https://example.test/actions/runs/101'
      refute_includes report, 'All required release workflows succeeded'
    end
  end

  def test_successful_image_publish_does_not_hide_failed_documentation_deployment
    report = run_release_completion({
      'publish.yml' => [[release_run('release-sha', 'release')]],
      'deploy-docs.yml' => [[release_run('release-sha', 'push', id: 102, conclusion: 'failure')]]
    }, { 'RELEASE_SHA' => 'release-sha', 'RELEASE_TAG' => 'v1.2.3', 'DEPLOYMENT_WORKFLOW' => 'deploy-docs.yml' },
                                       success: false)
    assert_includes report, 'publish.yml, run 101: https://example.test/actions/runs/101 — success'
    assert_includes report, 'deploy-docs.yml, run 102: https://example.test/actions/runs/102 — failure'
    assert_includes report, 'Issue stays in Release'
  end

  # Fakes for the commands the release step runs besides gh: git, node (the engine's release-bump scripts), date.
  def install_release_fakes
    bin = File.join(@directory, 'bin')
    date = ENV.fetch('PATH').split(File::PATH_SEPARATOR).map { |dir| File.join(dir, 'date') }.find { |path| File.executable?(path) }
    File.symlink(date, File.join(bin, 'date')) unless File.exist?(File.join(bin, 'date'))
    log = "require 'json'\nFile.open(ENV.fetch('TEST_CALLS'), 'a') { |f| f.puts(JSON.generate([File.basename($0)] + ARGV)) }\n"
    {
      'git' => <<~RUBY,
        case ARGV.first
        when 'describe' then puts ENV.fetch('FAKE_PREV_TAG', 'v1.2.2')
        when 'ls-remote' then exit 2
        when 'log' then puts 'feat: ship something'
        end
      RUBY
      'node' => <<~RUBY
        script = File.basename(ARGV[0].to_s)
        $stdin.read if %w[plan-batch.mjs pr-ships.mjs].include?(script) # piped input; elsewhere stdin is the step script itself
        if ARGV[0] == '-p' then puts '1.2.2'
        elsif script == 'plan-batch.mjs' then puts ENV.fetch('FAKE_BATCH')
        elsif script == 'classify-bump.mjs' then puts ENV.fetch('FAKE_DECISION')
        elsif script == 'pr-ships.mjs' then puts 'true'
        end
      RUBY
    }.each do |name, body|
      path = File.join(bin, name)
      File.write(path, "#!#{RbConfig.ruby}\n#{log}#{body}")
      File.chmod(0o755, path)
    end
    engine = File.join(@directory, 'engine/skills')
    %w[release-bump/scripts/classify-bump.mjs release-bump/scripts/prepare-release.mjs
       release-readiness/scripts/verify-release-readiness.mjs].each do |relative|
      FileUtils.mkdir_p(File.dirname(File.join(engine, relative)))
      File.write(File.join(engine, relative), '')
    end
    File.write(File.join(@directory, 'package.json'), '{"name":"@alten-group/megadex","version":"1.2.2"}')
    engine
  end

  def run_service_release(decision:, batch: nil, milestone: true, success: true)
    engine = install_release_fakes
    entry = step('prove', 'release')
    assert_includes entry.fetch('run'), 'ENGINE_SKILLS=/tmp/coding-pal-engine/skills'
    script = entry.fetch('run').sub('ENGINE_SKILLS=/tmp/coding-pal-engine/skills', "ENGINE_SKILLS=#{engine}")
    issue = { 'title' => 'feat: add export endpoint', 'labels' => [], 'comments' => [] }
    issue['milestone'] = { 'title' => 'Train 1.3', 'number' => 7 } if milestone
    data = scenario([], prs: [], issues: [{ 'number' => 41, 'title' => 'feat: a', 'state' => 'CLOSED', 'labels' => [] }],
                        pr: { 'labels' => [], 'files' => [{ 'path' => 'src/export.js' }], 'mergeCommit' => { 'oid' => 'release-merge-sha' } })
    data['issue'] = issue
    environment = { 'BASE_REF' => 'main', 'FAKE_DECISION' => JSON.generate(decision), 'FAKE_BATCH' => JSON.generate(batch || {}) }
    output = run_step(entry.merge('run' => script), data, environment, success: success)
    @gh = @calls.reject { |args| %w[git node].include?(args.first) }
    @commands = @calls.map { |args| args.first(2).join(' ') }
    output
  end

  def release_decision(version, bump: 'minor', confirmation: false)
    { 'bump' => bump, 'reason' => 'feature added', 'targetVersion' => version, 'needsConfirmation' => confirmation,
      'shippedChanges' => ['GET /export'] }
  end

  def test_release_step_opens_release_pr_merges_it_and_creates_the_github_release_on_the_merge_commit
    batch = { 'hold' => false, 'pending' => [], 'members' => [41, 42], 'labels' => ['feature'], 'titles' => ['feat: a', 'feat: b'] }
    output = run_service_release(decision: release_decision('1.3.0'), batch: batch)
    assert_equal 'v1.3.0', output.fetch('release_tag')
    assert_equal 'release-merge-sha', output.fetch('release_sha')
    assert_equal '41 42', output.fetch('batch_members')
    refute output.key?('held')
    order = [
      'node -', 'git checkout', 'git push', 'pr create', 'pr merge', 'release create'
    ].map { |prefix| @commands.rindex { |command| command.start_with?(prefix) } }
    refute_includes order, nil
    assert_equal order.sort, order, 'classify/branch -> push -> release PR -> merge -> GitHub Release'
    prepare = @calls.find { |args| args.first == 'node' && args[1].to_s.end_with?('prepare-release.mjs') }
    assert_includes prepare, '1.3.0'
    assert_operator @calls.index { |args| args[1].to_s.end_with?('classify-bump.mjs') }, :<, @calls.index(prepare)
    assert_includes @calls, ['git', 'checkout', '-b', 'release/v1.3.0']
    assert_includes @calls, ['git', 'push', 'origin', 'release/v1.3.0']
    create = @gh.find { |args| args.first(2) == %w[pr create] }
    assert_equal 'release/v1.3.0', create[create.index('--head') + 1]
    assert_equal 'main', create[create.index('--base') + 1]
    assert_equal 'chore(release): v1.3.0', create[create.index('--title') + 1]
    merges = @gh.select { |args| args.first(2) == %w[pr merge] }
    assert_equal [['pr', 'merge', '99', '--squash', '--delete-branch']], merges, 'Plain merge first; --admin only as the fallback'
    release = @gh.find { |args| args.first(2) == %w[release create] }
    assert_equal ['release', 'create', 'v1.3.0', '--target', 'release-merge-sha', '--title', 'v1.3.0', '--generate-notes'], release
    assert @gh.any? { |args| args.first == 'api' && args.include?('PATCH') && args.join(' ').include?('milestones/7') && args.include?('state=closed') },
           'A finished train closes its milestone'
  end

  def test_release_step_marks_versions_with_a_prerelease_suffix_as_prerelease
    run_service_release(decision: release_decision('2.0.0-rc.1', bump: 'major'), milestone: false)
    release = @gh.find { |args| args.first(2) == %w[release create] }
    assert_includes release, '--prerelease'
    assert_equal 'v2.0.0-rc.1', release[2]
    assert @gh.any? { |args| args.first(2) == %w[pr create] && args.include?('release/v2.0.0-rc.1') }
  end

  def test_release_step_holds_a_pending_milestone_train_without_releasing
    batch = { 'hold' => true, 'pending' => [43, 44], 'members' => [41, 42], 'labels' => [], 'titles' => [] }
    output = run_service_release(decision: release_decision('1.3.0'), batch: batch)
    assert_equal 'true', output.fetch('held')
    refute output.key?('release_tag')
    comment = @gh.find { |args| args.first(2) == %w[issue comment] }
    assert_includes comment.last, '# Release held: milestone Train 1.3'
    assert_includes comment.last, '#43, #44'
    refute @gh.any? { |args| %w[pr release].include?(args.first) && %w[create merge].include?(args[1]) }
    refute @calls.any? { |args| args.first == 'git' && (args[1] == 'push' || args.first(3) == %w[git checkout -b]) }
    refute @calls.any? { |args| args[1].to_s.end_with?('classify-bump.mjs') }, 'The bump is only decided once the train is complete'
  end

  def test_release_step_with_no_bump_reports_no_release_and_publishes_nothing
    output = run_service_release(decision: release_decision(nil, bump: 'none'), milestone: false)
    refute output.key?('release_tag')
    comment = @gh.find { |args| args.first(2) == %w[issue comment] }
    assert_includes comment.last, '# No release'
    refute @gh.any? { |args| %w[pr release].include?(args.first) && %w[create merge].include?(args[1]) }
    refute @calls.any? { |args| args.first == 'git' && (args[1] == 'push' || args.first(3) == %w[git checkout -b]) }
  end

  def test_release_step_refuses_an_unconfirmed_major_bump
    run_service_release(decision: release_decision('2.0.0', bump: 'major', confirmation: true), milestone: false, success: false)
    assert_includes @gh.find { |args| args.first(2) == %w[issue comment] }.last, '# Release blocked'
    refute @gh.any? { |args| args.first(2) == %w[release create] || args.first(2) == %w[pr create] }
  end

  def test_start_release_dispatches_release_workflow_with_publish_and_deployment_settings
    status_script = status_step('prove', 'Prove').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
    File.write(File.join(@directory, 'prove-project-status.sh'), status_script)
    entry = step('prove', 'start_release')
    run_step(entry, scenario([], project: project), release_environment.merge(
      'RELEASE_SHA' => 'release-merge-sha', 'RELEASE_TAG' => 'v1.3.0', 'DEPLOYMENT_WORKFLOW' => 'deploy-docs.yml',
      'DEPLOYMENT_EVENT' => 'release', 'RELEASE_HELD' => '', 'BATCH_MEMBERS' => '41 42'
    ))
    dispatch = dispatches.fetch(0)
    assert_equal 'release.yml', dispatch[2]
    %w[publish_workflow=publish.yml deployment_event=release deployment_workflow=deploy-docs.yml
       release_sha=release-merge-sha release_tag=v1.3.0 batch_issues=41].each do |pair|
      assert_includes dispatch, pair
    end
    refute dispatch.any? { |arg| arg.include?('npm') }
    held = run_step(entry, scenario([], project: project), release_environment.merge('RELEASE_HELD' => 'true'))
    assert_equal 'false', held.fetch('dispatched')
    assert_empty dispatches
  end

  def test_release_event_deployment_is_awaited_at_the_release_commit_only_when_a_release_exists
    runs = {
      'publish.yml' => [[release_run('release-sha', 'release')]],
      'deploy-pages.yml' => [[release_run('release-sha', 'release', id: 102)]]
    }
    environment = { 'DEPLOYMENT_WORKFLOW' => 'deploy-pages.yml', 'DEPLOYMENT_EVENT' => 'release',
                    'DEPLOYMENT_PATHS' => "website/\n", 'RELEASE_SHA' => 'release-sha', 'RELEASE_TAG' => 'v1.2.3' }
    report = run_release_completion(runs, environment)
    assert_includes report, 'deploy-pages.yml, run 102: https://example.test/actions/runs/102'
    assert_includes report, 'All required release workflows succeeded'
    polls = @calls.select { |args| args.first == 'api' }.map { |args| args[1] }
    assert polls.any? { |url| url.include?('workflows/publish.yml/runs?event=release&head_sha=release-sha') }
    assert polls.any? { |url| url.include?('workflows/deploy-pages.yml/runs?event=release&head_sha=release-sha') }
    refute polls.any? { |url| url.include?('event=push') }, 'Release-event deployments must not use the push path filter'

    failing = { 'publish.yml' => runs['publish.yml'],
                'deploy-pages.yml' => [[release_run('release-sha', 'release', id: 102, conclusion: 'failure')]] }
    report = run_release_completion(failing, environment, success: false)
    assert_includes report, 'Issue stays in Release'

    report = run_release_completion({}, environment.merge('RELEASE_SHA' => '', 'RELEASE_TAG' => ''))
    assert_includes report, 'Deployment not applicable'
    refute @calls.any? { |args| args.first == 'api' }, 'No release commit means nothing to await'
  end

  def test_release_revision_and_reports_are_persisted
    release = step('prove', 'release').fetch('run')
    assert_includes release, '--target "$RELEASE_COMMIT"'
    assert_includes release, 'echo "release_sha=${RELEASE_COMMIT}" >> "$GITHUB_OUTPUT"'
    artifact = steps('prove').find { |entry| entry.dig('with', 'name') == 'prove-spec' }
    assert_includes artifact.dig('with', 'path'), 'reports/release.md'
    assert_includes artifact.fetch('if'), 'always()'
    release_artifact = steps('release').find { |entry| entry['uses'].to_s.start_with?('actions/upload-artifact@') }
    assert_includes release_artifact.dig('with', 'path'), 'reports/release.md'
    assert_includes release_artifact.fetch('if'), 'always()'
  end

  def test_missing_release_run_times_out_instead_of_marking_done
    report = run_release_completion(
      { 'deploy-pages.yml' => [[]] }, { 'DEPLOYMENT_WORKFLOW' => 'deploy-pages.yml' }, success: false
    )
    assert_includes report, 'Timed out'
    assert_includes report, 'Last run: not created'
    assert_equal 120, @calls.count { |args| args.first == 'api' }
  end

  def test_release_api_failure_is_explicit_and_reported
    report = run_release_completion({}, { 'DEPLOYMENT_WORKFLOW' => 'deploy-pages.yml' },
                                    success: false, api_failure: true)
    assert_includes report, 'Could not read deploy-pages.yml'
    assert_includes @stdout, '::error::'
    assert @calls.any? { |args| args.first(2) == %w[issue comment] }
  end

  def test_merge_only_repositories_complete_without_waiting_for_nonexistent_workflows
    report = run_release_completion({})
    assert_includes report, 'no external publication/deployment was applicable'
    refute @calls.any? { |args| args.first == 'api' }

    status_script = status_step('prove', 'Prove').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
    File.write(File.join(@directory, 'prove-project-status.sh'), status_script)
    start_release = step('prove', 'start_release')
    output = run_step(start_release, scenario([], project: project), release_environment)
    assert_equal 'false', output.fetch('dispatched')
    assert @calls.any? { |args| args.include?('optionId=done') }
  end

  def test_release_failure_keeps_status_and_posts_durable_failure_links
    status_script = status_step('prove', 'Prove').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
    File.write(File.join(@directory, 'prove-project-status.sh'), status_script)
    entry = steps('prove').find { |item| item['name'] == 'Report Release failure on the issue and PR' }
    assert_includes entry.fetch('if'), 'failure()'
    assert_includes entry.fetch('if'), "steps.release_stage.outcome == 'success'"
    run_step(entry, scenario([], project: project), release_environment)
    assert @calls.any? { |args| args.include?('optionId=release') }
    %w[issue pr].each do |target|
      assert @calls.any? { |args| args.first(2) == [target, 'comment'] && args.last.include?('actions/runs/123') }
    end
    marker = steps('prove').find { |item| item['name'] == 'Mark issue needs:developer if Prove failed' }
    run_step(marker, scenario)
    assert @calls.any? { |args| args.first(2) == %w[issue edit] && args.include?('needs:developer') }
    refute @calls.any? { |args| args.first(2) == %w[issue comment] }, 'Must not duplicate issue comment when Release failure already reported it'
  end

  def test_documentation_path_gate_uses_real_git_and_selects_the_triggering_push
    prepare_stale_pr
    run_freshness_script('Refresh PR branch against latest base')
    FileUtils.mkdir_p(File.join(@repository, 'src'))
    File.write(File.join(@repository, 'src/service.js'), 'export const value = 1;')
    git_command('add', '.')
    git_command('commit', '-m', 'Service implementation')
    merge_sha = git_command('rev-parse', 'HEAD')
    File.write(File.join(@repository, 'CHANGELOG.md'), 'New release')
    git_command('add', '.')
    git_command('commit', '-m', 'Release metadata only')
    release_sha = git_command('rev-parse', 'HEAD')
    environment = release_environment.merge(
      'RELEASE_MERGE_SHA' => merge_sha, 'RELEASE_SHA' => release_sha, 'RELEASE_TAG' => 'v1.2.3',
      'DEPLOYMENT_WORKFLOW' => 'deploy-docs.yml', 'DEPLOYMENT_PATHS' => "website/\nsrc/\n.github/workflows/deploy-docs.yml",
      'PROVE_BASE_SHA' => @base_sha
    )
    data = scenario([], release_runs: {
      'publish.yml' => [[release_run(release_sha, 'release')]],
      'deploy-docs.yml' => [[release_run(merge_sha, 'push')]]
    })
    run_freshness_script('Wait for publication and deployment before Done', data: data, **environment.transform_keys(&:to_sym))
    assert @calls.any? { |args| args.first == 'api' && args[1].include?("deploy-docs.yml/runs?event=push&head_sha=#{merge_sha}") }

    FileUtils.mkdir_p(File.join(@repository, 'website'))
    File.write(File.join(@repository, 'website/package.json'), '{"version":"1.2.3"}')
    git_command('add', '.')
    git_command('commit', '-m', 'Release website metadata')
    release_sha = git_command('rev-parse', 'HEAD')
    data['release_runs'] = {
      'publish.yml' => [[release_run(release_sha, 'release')]],
      'deploy-docs.yml' => [[release_run(release_sha, 'push')]]
    }
    run_freshness_script('Wait for publication and deployment before Done', data: data,
                         **environment.merge('RELEASE_SHA' => release_sha).transform_keys(&:to_sym))
    assert @calls.any? { |args| args.first == 'api' && args[1].include?("deploy-docs.yml/runs?event=push&head_sha=#{release_sha}") }
  end

  def test_documentation_is_not_awaited_when_neither_push_matches_its_paths
    prepare_stale_pr
    run_freshness_script('Refresh PR branch against latest base')
    merge_sha = git_command('rev-parse', 'HEAD')
    environment = release_environment.merge(
      'RELEASE_MERGE_SHA' => merge_sha, 'PROVE_BASE_SHA' => @base_sha,
      'DEPLOYMENT_WORKFLOW' => 'deploy-docs.yml', 'DEPLOYMENT_PATHS' => "website/\nsrc/\n.github/workflows/deploy-docs.yml"
    )
    run_freshness_script('Wait for publication and deployment before Done', data: scenario, **environment.transform_keys(&:to_sym))
    refute @calls.any? { |args| args.first == 'api' }
    assert_includes File.read(File.join(@repository, 'reports/release.md')), 'Deployment not applicable'
  end

  def test_autonomous_decision_validation_is_installed_for_think
    assert_includes install_step('think').fetch('run'), 'install-primitives.sh" --stage think'
    definition = stage_definitions.fetch('think')
    assert_includes definition.fetch(:skills), 'decision-record'
    assert_includes definition.fetch(:instructions), 'decision-record'
    assert File.file?(File.join(ROOT, 'skills/decision-record/scripts/validate-decision.mjs'))
  end

  def test_high_risk_automated_metadata_is_checked_before_merge
    script = steps('prove').find { |entry| entry['name'] == 'Prepare automated validation recording' }.fetch('run')
    assert_includes script, 'readPlan, readThink'
    assert_includes script, 'if [ "$TIER" = "High" ] || [ "$TIER" = "Critical" ]'
    assert_includes script, "only when concrete rollback verification evidence is recorded"
    assert_includes script, "leave the affected field Pending"
    refute_includes script, 'copilot --model="auto"'
    assert_operator script.index('--stage pass'), :<, script.index('--stage prove')
    entries = steps('prove')
    merge = entries.find { |entry| entry['name'] == 'Verify validated revisions and merge' }
    assert_operator entries.index(merge), :>, entries.index { |entry| entry['name'] == 'Run Prove validation and auto-remediation loop' }
  end

  def git_command(*arguments, directory: @repository)
    output, error, status = Open3.capture3(
      { 'HOME' => @directory, 'GIT_CONFIG_NOSYSTEM' => '1' },
      'git', *arguments, chdir: directory
    )
    assert status.success?, "#{arguments.inspect}\n#{output}\n#{error}"
    output.strip
  end

  def prepare_stale_pr(conflict: false)
    @repository = File.join(@directory, 'repository')
    remote = File.join(@directory, 'remote.git')
    Dir.mkdir(@repository)
    git_command('init', '--bare', remote)
    git_command('init', '-b', 'main')
    git_command('config', 'user.name', 'Test')
    git_command('config', 'user.email', 'test@example.test')
    File.write(File.join(@repository, 'shared.txt'), "original\n")
    git_command('add', '.')
    git_command('commit', '-m', 'Initial')
    git_command('remote', 'add', 'origin', remote)
    git_command('push', 'origin', 'main')
    git_command('checkout', '-b', 'feature/issue-42-test')
    File.write(File.join(@repository, conflict ? 'shared.txt' : 'feature.txt'), "feature\n")
    git_command('add', '.')
    git_command('commit', '-m', 'Feature')
    git_command('push', 'origin', 'HEAD')
    git_command('checkout', 'main')
    File.write(File.join(@repository, 'shared.txt'), "updated base\n")
    git_command('add', '.')
    git_command('commit', '-m', 'Intervening change')
    git_command('push', 'origin', 'main')
    @base_sha = git_command('rev-parse', 'HEAD')
    git_command('checkout', 'feature/issue-42-test')
  end

  def run_freshness_script(name, data: scenario, success: true, **environment)
    entry = (steps('prove') + steps('release')).find { |item| item['name'] == name }
    File.write(@environment.fetch('TEST_SCENARIO'), JSON.generate(data))
    File.write(@environment.fetch('TEST_CALLS'), '')
    File.write(@environment.fetch('TEST_VIOLATIONS'), '')
    declared = resolve_step_environment(entry)
    env = @environment.merge(declared).merge(
      'PATH' => "#{@environment.fetch('PATH')}#{File::PATH_SEPARATOR}#{ENV.fetch('PATH')}",
      'BASE_REF' => 'main', 'BRANCH_NAME' => 'feature/issue-42-test'
    ).merge(environment.transform_keys(&:to_s))
    output, error, status = Open3.capture3(
      env, 'bash', '--noprofile', '--norc', '-eo', 'pipefail',
      stdin_data: entry.fetch('run'), chdir: @repository, unsetenv_others: true
    )
    assert_equal success, status.success?, "#{output}\n#{error}"
    assert_equal '', File.read(@environment.fetch('TEST_VIOLATIONS'))
    @calls = File.readlines(@environment.fetch('TEST_CALLS')).map { |line| JSON.parse(line) }
    output
  end

  def test_prove_refreshes_and_pushes_a_stale_branch_before_checks
    prepare_stale_pr
    run_freshness_script('Refresh PR branch against latest base')
    assert_equal "updated base\n", File.read(File.join(@repository, 'shared.txt'))
    assert_equal git_command('rev-parse', 'HEAD'),
                 git_command('rev-parse', 'refs/remotes/origin/feature/issue-42-test')
    assert_includes File.read(@environment.fetch('GITHUB_ENV')), "PROVE_BASE_SHA=#{@base_sha}"
    head = git_command('rev-parse', 'HEAD')
    run_freshness_script('Refresh PR branch against latest base')
    assert_equal head, git_command('rev-parse', 'HEAD'), 'Already-current branches must not get extra commits'
    entries = steps('prove')
    assert_operator entries.index { |entry| entry['id'] == 'freshness' }, :<,
                    entries.index { |entry| entry['name'] == 'Run Prove validation and auto-remediation loop' }
  end

  def test_code_creates_branch_from_latest_remote_base_not_stale_checkout
    prepare_stale_pr
    old_base = git_command('rev-parse', 'main~1')
    git_command('checkout', '--detach', old_base)
    git_command('update-ref', 'refs/remotes/origin/main', old_base)
    specs = File.join(@repository, 'specs/issue-42')
    FileUtils.mkdir_p(specs)
    File.write(File.join(specs, 'think.md'), "# Think: test\n")
    File.write(File.join(specs, 'plan.md'), "# Plan: test\n")
    File.write(@environment.fetch('TEST_SCENARIO'), JSON.generate(scenario.merge('issue' => { 'title' => 'Fresh branch' })))
    File.write(@environment.fetch('TEST_CALLS'), '')
    File.write(@environment.fetch('TEST_VIOLATIONS'), '')
    entry = steps('code').find { |item| item['name'] == 'Prepare implementation branch and commit specs' }
    environment = @environment.merge(resolve_step_environment(entry)).merge(
      'PATH' => "#{@environment.fetch('PATH')}#{File::PATH_SEPARATOR}#{ENV.fetch('PATH')}",
      'BASE_REF' => 'main'
    )
    output, error, status = Open3.capture3(
      environment, 'bash', '--noprofile', '--norc', '-eo', 'pipefail',
      stdin_data: entry.fetch('run'), chdir: @repository, unsetenv_others: true
    )
    assert status.success?, "#{output}\n#{error}"
    assert_equal '', File.read(@environment.fetch('TEST_VIOLATIONS'))
    assert_equal 'feature/issue-42-fresh-branch', git_command('branch', '--show-current')
    assert_equal @base_sha, git_command('rev-parse', 'HEAD')
    assert_equal "updated base\n", File.read(File.join(@repository, 'shared.txt'))
  end

  def test_conflicts_abort_without_pushing_or_merging
    prepare_stale_pr(conflict: true)
    head = git_command('rev-parse', 'HEAD')
    output = run_freshness_script('Refresh PR branch against latest base')
    assert_includes output, '::warning::'
    assert_includes output, 'Re-running Code from the latest main'
    assert_equal head, git_command('rev-parse', 'HEAD')
    assert_equal head, git_command('rev-parse', 'refs/remotes/origin/feature/issue-42-test')
    assert_equal '', git_command('status', '--porcelain')
    assert @calls.any? { |args| args.first(2) == %w[pr comment] }
    assert @calls.any? { |args| args.first(3) == ['pr', 'edit', '99'] && args.include?('--add-label') && args.include?('needs:rebase') }
    assert_equal [['workflow', 'run', 'code.yml', '-f', 'issue_number=42']], dispatches
    refute @calls.any? { |args| args.first(2) == %w[pr merge] }
    assert_includes File.read(@environment.fetch('GITHUB_OUTPUT')), 'conflict=true'
  end

  def test_merge_requires_unchanged_base_and_exact_validated_head
    prepare_stale_pr
    run_freshness_script('Refresh PR branch against latest base')
    head = git_command('rev-parse', 'HEAD')
    name = 'Verify validated revisions and merge'
    run_freshness_script(name, data: scenario(pr: { 'headRefOid' => head, 'mergeCommit' => { 'oid' => 'merged-sha' } }), PROVE_BASE_SHA: @base_sha)
    assert_includes @calls, ['pr', 'merge', '99', '--squash', '--delete-branch', '--match-head-commit', head]
    assert_includes File.read(@environment.fetch('GITHUB_ENV')), 'RELEASE_MERGE_SHA=merged-sha'
    [
      [@base_sha, 'a' * 40],
      ['b' * 40, head]
    ].each do |base, remote_head|
      output = run_freshness_script(name, data: scenario(pr: { 'headRefOid' => remote_head }),
                                   PROVE_BASE_SHA: base, success: false)
      assert_includes output, '::error::'
      refute @calls.any? { |args| args.first(2) == %w[pr merge] }
    end
  end

  if ENV['PROJECT_WORKFLOWS_ROOT']
    def test_all_deployment_callers_track_completion_with_matching_push_filters
      root = ENV.fetch('PROJECT_WORKFLOWS_ROOT')
      Dir.glob(File.join(root, '*/.github/workflows/code.yml')).each do |code_path|
        directory = File.dirname(code_path)
        %w[code prove].each do |phase|
          current = YAML.load_file(File.join(directory, "#{phase}.yml"))
          settings = current.fetch('jobs').fetch('prove').fetch('with')
          deployment = Dir.glob(File.join(directory, 'deploy-*.yml'))
          assert_operator deployment.length, :<=, 1
          if deployment.empty?
            refute settings.key?('deployment_workflow'), code_path
            next
          end
          filename = File.basename(deployment.first)
          assert_equal filename, settings.fetch('deployment_workflow'), code_path
          workflow = YAML.load_file(deployment.first)
          triggers = workflow['on'] || workflow.fetch(true)
          push = triggers.fetch('push')
          expected = settings.fetch('deployment_paths', '').lines.map(&:strip).reject(&:empty?)
          paths = push.fetch('paths', []).map { |path| path.delete_suffix('**') }
          assert_equal paths, expected, code_path
        end
      end
    end

    def test_project_wrapper_contracts
      projects = {
        'Megadex' => 'Megadex', 'Foxnox' => 'Foxnox', 'Gatelin' => 'Gatelin'
      }
      projects.each do |repository, title|
        directory = File.join(ENV.fetch('PROJECT_WORKFLOWS_ROOT'), repository, '.github/workflows')
        wrapper = YAML.load_file(File.join(directory, 'think.yml'))
        # Psych's YAML 1.1 parser treats the unquoted Actions "on" key as true.
        triggers = wrapper['on'] || wrapper.fetch(true)
        assert_equal ['labeled'], triggers.fetch('issues').fetch('types'), repository
        job = wrapper.fetch('jobs').fetch('think')
        assert_equal 'inherit', job.fetch('secrets'), repository
        labels = job.fetch('if').scan(/github.event.label.name == '([^']+)'/).flatten
        assert_equal ['1-think'], labels, repository
        expected = "github.event_name == 'workflow_dispatch' || " \
                   "(github.event_name == 'issues' && github.event.issue.state == 'open' && " \
                   "github.event.label.name == '1-think')"
        assert_equal expected, job.fetch('if').split.join(' '), repository
        assert_equal title, job.fetch('with').fetch('project_title')
        assert_equal 'ALTEN-group/coding-pal/.github/workflows/pipeline-think.yml@main', job.fetch('uses')
        %w[plan code prove].each do |phase|
          current = YAML.load_file(File.join(directory, "#{phase}.yml"))
          job = current.fetch('jobs').fetch(phase)
          assert_equal 'inherit', job.fetch('secrets'), repository
          events = current['on'] || current.fetch(true)
          if %w[plan code].include?(phase)
            assert_equal %w[issues workflow_dispatch], events.keys, "#{repository} #{phase}.yml"
            assert_equal ['labeled'], events.fetch('issues').fetch('types'), "#{repository} #{phase}.yml"
            assert_equal "${{ inputs.issue_number || github.event.issue.number || '' }}", job.fetch('with').fetch('issue_number')
            phase_labels = job.fetch('if').scan(/github.event.label.name == '([^']+)'/).flatten
            assert_equal phase == 'plan' ? ['2-plan'] : %w[3-code 4-prove 5-release], phase_labels, "#{repository} #{phase}.yml"
          else
            assert_equal ['workflow_dispatch'], events.keys, repository
            refute job.key?('if'), repository
          end
          inputs = events.fetch('workflow_dispatch').fetch('inputs')
          assert_equal false, inputs.fetch('workflow_run_id').fetch('required')
          assert_equal false, inputs.fetch('issue_number').fetch('required')
          assert_equal "${{ inputs.workflow_run_id || '' }}", job.fetch('with').fetch('workflow_run_id')
          assert_equal "Pipeline - #{phase.capitalize}", current.fetch('name')
          if %w[code prove].include?(phase)
            assert_equal 'delivery-${{ github.repository }}', current.dig('concurrency', 'group')
            assert_equal false, current.dig('concurrency', 'cancel-in-progress')
            assert_equal 'max', current.dig('concurrency', 'queue')
          else
            refute current.key?('concurrency')
          end
        end
        code = YAML.load_file(File.join(directory, 'code.yml'))
        prove_wrapper = YAML.load_file(File.join(directory, 'prove.yml'))
        prove = code.fetch('jobs').fetch('prove')
        assert_equal 'code', prove.fetch('needs')
        assert_equal "needs.code.outputs.continue_to_prove == 'true'", prove.fetch('if')
        assert_equal 'ALTEN-group/coding-pal/.github/workflows/pipeline-prove.yml@main', prove.fetch('uses')
        assert_equal '${{ github.run_id }}', prove.dig('with', 'workflow_run_id')
        assert_equal title, prove.dig('with', 'project_title')
        assert_equal 'inherit', prove.fetch('secrets')
        refute prove.fetch('with').key?('auto_release_npm'), "#{repository} code.yml"
        refute prove_wrapper.dig('jobs', 'prove', 'with').key?('auto_release_npm'), "#{repository} prove.yml"
        audits = YAML.load_file(File.join(directory, 'audits.yml'))
        assert_equal 'Audit - Run audit', audits.fetch('name')
        audit_triggers = audits['on'] || audits.fetch(true)
        assert_equal ['0 6 * * 1', '0 6 * * 3', '0 6 * * 5'],
                     audit_triggers.fetch('schedule').map { |item| item.fetch('cron') },
                     "#{repository} audits.yml schedule"
        audit_options = audit_triggers.dig('workflow_dispatch', 'inputs', 'audit', 'options')
        assert_equal 'all', audit_options.first, "#{repository} audits.yml must support 'all' option"
        assert_equal 'all', audit_triggers.dig('workflow_dispatch', 'inputs', 'audit', 'default'), "#{repository} audits.yml default"
        audits.fetch('jobs').each do |job_name, audit_job|
          assert_includes audit_job.fetch('if'), '!github.event.repository.private',
                          "#{repository} audits.yml #{job_name} must block scheduled runs on private repositories"
        end
        refute File.exist?(File.join(directory, 'upstream-resume.yml')), "#{repository} must not keep the upstream-resume wrapper"
        release_wrapper = YAML.load_file(File.join(directory, 'release.yml'))
        assert_equal 'Pipeline - Release', release_wrapper.fetch('name'), "#{repository} release.yml"
        assert_equal 'ALTEN-group/coding-pal/.github/workflows/pipeline-release.yml@main',
                     release_wrapper.dig('jobs', 'release', 'uses'), "#{repository} release.yml"
        refute release_wrapper.key?('concurrency'), "#{repository} release.yml must not share the delivery concurrency lock"
      end
    end
  end

  def test_scope_guard_extracts_in_scope_from_file_scope_and_boundaries
    plan_md = <<~MARKDOWN
      # Plan: Secret Room Door SFX

      ## File Scope & Boundaries
      - **In Scope:** `src/levels/door.ts`, `tests/door.test.ts`
      - **Out of Scope:** `src/audio/engine.ts`
      - **Irreversible Changes:** _None._
    MARKDOWN
    multiline_plan_md = <<~MARKDOWN
      # Plan: Player-configurable controls page

      ## File Scope & Boundaries

      - **In Scope:**
        - `src/keymap.js`
        - `src/controls.js`
        - `tests/sim.test.mjs`
      - **Out of Scope:**
        - `index.html`
      - **Irreversible Changes:** _None._

      ## Prerequisites & Context
      - Reference: `specs/issue-26/think.md`
    MARKDOWN
    plan_file = File.join(@directory, 'plan.md')
    multiline_plan_file = File.join(@directory, 'multiline_plan.md')
    File.write(plan_file, plan_md)
    File.write(multiline_plan_file, multiline_plan_md)
    [
      steps('prove').find { |item| item['name'] == 'Run Prove validation and auto-remediation loop' }.fetch('run'),
      steps('code').find { |item| item['name'] == 'Run deterministic Code exit gates' }.fetch('run')
    ].each do |script|
      snippet = script[/node -e '\s*(const fs = require\("fs"\);.*?)' "\$\{SPEC_DIR\}\/plan\.md"/m, 1]
      refute_nil snippet
      out, status = Open3.capture2('node', '-e', snippet, plan_file)
      assert status.success?
      assert_equal %w[src/levels/door.ts tests/door.test.ts], out.lines.map(&:strip).reject(&:empty?)

      multiline_out, multiline_status = Open3.capture2('node', '-e', snippet, multiline_plan_file)
      assert multiline_status.success?
      assert_equal %w[src/keymap.js src/controls.js tests/sim.test.mjs], multiline_out.lines.map(&:strip).reject(&:empty?)
    end
  end

  def test_developer_comments_and_previous_specs_are_passed_to_agents
    copilot_args_file = File.join(@directory, 'copilot_args.json')
    copilot_bin = File.join(@directory, 'bin/copilot')
    File.write(copilot_bin, "#!#{RbConfig.ruby}\nrequire 'json'\nFile.write(#{copilot_args_file.inspect}, JSON.generate(ARGV))\n")
    File.chmod(0o755, copilot_bin)
    printf_exec = ENV.fetch('PATH').split(File::PATH_SEPARATOR)
                     .map { |dir| File.join(dir, 'printf') }
                     .find { |candidate| File.executable?(candidate) && !File.directory?(candidate) }
    File.symlink(printf_exec, File.join(@directory, 'bin/printf')) if printf_exec && !File.exist?(File.join(@directory, 'bin/printf'))

    comments = [
      '# Think: initial think spec',
      '⏸️ **Paused after Think for Manual Validation**',
      '⚠️ **Code failed — issue stays in Code with `needs:developer`**',
      '# Plan: initial plan spec',
      'Pull request opened for #42: https://example.test/pr/99',
      'Please play the secret SFX when the door starts opening instead of on room entry.'
    ]
    data = scenario(['1-think'], comments: comments, prs: [{ 'number' => 99, 'headRefName' => 'feature/issue-42-test', 'labels' => [] }])
    data['issue']['title'] = 'Secret door SFX timing'
    data['issue']['body'] = 'See screenshot: <img src="https://github.com/user-attachments/assets/e5b56372-2c9f-4641-9647-58700774e69a" />'

    think_step = steps('think').find { |item| item['name'] == 'Fetch issue context and run Thinker agent' }
    run_step(think_step, data)
    think_prompt = JSON.parse(File.read(copilot_args_file)).last
    assert_includes think_prompt, '# Think: initial think spec'
    assert_includes think_prompt, 'Please play the secret SFX when the door starts opening instead of on room entry.'
    assert_includes think_prompt, 'Product & Design Ambition'
    assert_includes think_prompt, 'Attached Visual Evidence / Screenshots on Issue #42'
    assert_includes think_prompt, 'https://github.com/user-attachments/assets/e5b56372-2c9f-4641-9647-58700774e69a'
    refute_includes think_prompt, 'target under 350 words'
    refute_includes think_prompt, 'Paused after Think for Manual Validation'
    refute_includes think_prompt, 'Code failed — issue stays in Code'
    refute_includes think_prompt, 'Pull request opened for #42'

    plan_step = steps('plan').find { |item| item['name'] == 'Fetch issue context and run Planner agent' }
    run_step(plan_step, data)
    plan_prompt = JSON.parse(File.read(copilot_args_file)).last
    assert_includes plan_prompt, '# Plan: initial plan spec'
    assert_includes plan_prompt, 'Please play the secret SFX when the door starts opening instead of on room entry.'
    assert_includes plan_prompt, 'Rich, Concrete Step Specifications'
    assert_includes plan_prompt, 'Attached Visual Evidence / Screenshots on Issue #42'
    assert_includes plan_prompt, 'https://github.com/user-attachments/assets/e5b56372-2c9f-4641-9647-58700774e69a'
    refute_includes plan_prompt, '1 concise sentence per bullet'
    refute_includes plan_prompt, 'Paused after Think for Manual Validation'
    refute_includes plan_prompt, 'Code failed — issue stays in Code'

    code_step = steps('code').find { |item| item['name'] == 'Run Code Agent to implement plan.md and prepare pr.md' }
    run_step(code_step, data, { 'BRANCH_NAME' => 'feature/issue-42-test', 'BASE_REF' => 'main' })
    code_prompt = JSON.parse(File.read(copilot_args_file)).last
    assert_includes code_prompt, 'Please play the secret SFX when the door starts opening instead of on room entry.'
    assert_includes code_prompt, 'Attached Visual Evidence / Screenshots on Issue #42'
    assert_includes code_prompt, 'do NOT stop with zero commits'
    refute_includes code_prompt, 'Paused after Think for Manual Validation'
    refute_includes code_prompt, 'Code failed — issue stays in Code'
  end

  def test_ai_cost_footers_are_appended_and_stripped_when_restoring_specs
    copilot_bin = File.join(@directory, 'bin/copilot')
    session_dir = File.join(@directory, '.copilot/session-state/s1')
    File.write(copilot_bin, <<~RUBY)
      #!#{RbConfig.ruby}
      require 'fileutils'
      require 'json'
      dir = #{session_dir.inspect}
      FileUtils.mkdir_p(dir)
      File.write(File.join(dir, 'events.jsonl'), [
        JSON.generate({ 'type' => 'assistant.usage', 'model' => 'claude-sonnet-4.5', 'input_tokens' => 10_000, 'output_tokens' => 2_000 }),
        JSON.generate({ 'type' => 'assistant.usage', 'model' => 'claude-sonnet-4.5', 'input_tokens' => 5_000, 'output_tokens' => 1_000 })
      ].join("\\n") + "\\n")
    RUBY
    File.chmod(0o755, copilot_bin)

    data = scenario(['1-think'])
    data['issue']['title'] = 'Track AI cost per pipeline step'
    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))
    File.write(File.join(@directory, 'specs/issue-42/think.md'), "# Think: Track AI cost\n\n## Problem\nCost visibility.")

    think_agent_step = steps('think').find { |item| item['name'] == 'Fetch issue context and run Thinker agent' }
    run_step(think_agent_step, data)
    assert File.file?(File.join(@directory, 'specs/issue-42/ai-cost-step.md'))

    think_comment_step = steps('think').find { |item| item['name'] == 'Comment think.md on issue' }
    run_step(think_comment_step, data)
    comment_call = @calls.find { |args| args.first(2) == %w[issue comment] }
    refute_nil comment_call
    posted_think = File.read(comment_call[comment_call.index('--body-file') + 1])
    assert_includes posted_think, "# Think: Track AI cost\n\n## Problem\nCost visibility."
    assert_includes posted_think, '<!-- ai-cost-step:{"step":"Think","model":"claude-sonnet-4.5","input_tokens":15000,"output_tokens":3000,"cached_tokens":0,"requests":2,"cost_usd":0.09} -->'
    assert_includes posted_think, '💰 **AI Cost (Think):** `$0.0900` (`claude-sonnet-4.5` · 15000 in / 3000 out tokens · 2 requests)'
    refute_includes File.read(File.join(@directory, 'specs/issue-42/think.md')), 'ai-cost-step'

    plan_data = scenario(['2-plan'], comments: [posted_think])
    plan_data['issue']['title'] = 'Track AI cost per pipeline step'
    FileUtils.rm_rf(File.join(@directory, 'specs/issue-42'))
    run_step(step('plan', 'resolve'), plan_data)
    restored_think = File.read('/tmp/specs/issue-42/think.md')
    assert_equal "# Think: Track AI cost\n\n## Problem\nCost visibility.\n", restored_think
    refute_includes restored_think, 'ai-cost-step'

    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))
    File.write(File.join(@directory, 'specs/issue-42/think.md'), restored_think)
    File.write(File.join(@directory, 'specs/issue-42/plan.md'), "# Plan: Track AI cost\n\n## Steps\n1. Add cost footer.")
    plan_agent_step = steps('plan').find { |item| item['name'] == 'Fetch issue context and run Planner agent' }
    run_step(plan_agent_step, plan_data)
    plan_comment_step = steps('plan').find { |item| item['name'] == 'Comment plan.md on issue' }
    run_step(plan_comment_step, plan_data)
    plan_comment_call = @calls.find { |args| args.first(2) == %w[issue comment] }
    posted_plan = File.read(plan_comment_call[plan_comment_call.index('--body-file') + 1])
    assert_includes posted_plan, '💰 **AI Cost (Plan):** `$0.0900` (`claude-sonnet-4.5` · 15000 in / 3000 out tokens · 2 requests · **Cumulative:** `$0.1800`)'
    refute_includes File.read(File.join(@directory, 'specs/issue-42/plan.md')), 'ai-cost-step'
  ensure
    FileUtils.rm_rf('/tmp/specs/issue-42')
  end

  def test_release_report_includes_cumulative_ai_cost_summary_table
    comments = [
      "# Think: Spec\n\n---\n<!-- ai-cost-step:{\"step\":\"Think\",\"model\":\"claude-sonnet-4.5\",\"input_tokens\":10000,\"output_tokens\":2000,\"cached_tokens\":0,\"requests\":2,\"cost_usd\":0.06} -->\n💰 **AI Cost (Think):** `$0.0600`",
      "# Plan: Spec\n\n---\n<!-- ai-cost-step:{\"step\":\"Plan\",\"model\":\"claude-sonnet-4.5\",\"input_tokens\":20000,\"output_tokens\":4000,\"cached_tokens\":0,\"requests\":3,\"cost_usd\":0.12} -->\n💰 **AI Cost (Plan):** `$0.1200`",
      "Pull request opened for #42: https://example.test/pr/99\n\n---\n<!-- ai-cost-step:{\"step\":\"Code\",\"model\":\"claude-sonnet-4.5\",\"input_tokens\":50000,\"output_tokens\":10000,\"cached_tokens\":0,\"requests\":8,\"cost_usd\":0.3} -->\n💰 **AI Cost (Code):** `$0.3000`",
      "# Prove: Spec\n\n---\n<!-- ai-cost-step:{\"step\":\"Prove\",\"model\":\"claude-sonnet-4.5\",\"input_tokens\":15000,\"output_tokens\":1000,\"cached_tokens\":0,\"requests\":2,\"cost_usd\":0.06} -->\n💰 **AI Cost (Prove):** `$0.0600`"
    ]
    status_script = status_step('prove', 'Prove').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
    File.write(File.join(@directory, 'prove-project-status.sh'), status_script)
    data = scenario(['5-release'], comments: comments, project: project)
    run_step(step('prove', 'start_release'), data, { 'RELEASE_MERGE_SHA' => 'merge-sha' })
    report = File.read(File.join(@directory, 'reports/release.md'))
    assert_includes report, '## AI Cost Summary'
    assert_includes report, '| Think | `claude-sonnet-4.5` | 10000 | 2000 | 2 | `$0.0600` |'
    assert_includes report, '| Plan | `claude-sonnet-4.5` | 20000 | 4000 | 3 | `$0.1200` |'
    assert_includes report, '| Code | `claude-sonnet-4.5` | 50000 | 10000 | 8 | `$0.3000` |'
    assert_includes report, '| Prove | `claude-sonnet-4.5` | 15000 | 1000 | 2 | `$0.0600` |'
    assert_includes report, '| **Total** | — | **95000** | **17000** | **15** | **`$0.5400`** |'
  end

  def test_project_board_syncs_cumulative_ai_cost_custom_field
    %w[think plan code prove release].each do |workflow|
      refute_includes File.read(File.join(ROOT, ".github/workflows/pipeline-#{workflow}.yml")), 'field(name: "AI Cost")',
        "pipeline-#{workflow}.yml must not use field(name: \"AI Cost\") which throws a GraphQL error when a project lacks the AI Cost field"
    end

    comments = [
      "# Think: Spec\n\n---\n<!-- ai-cost-step:{\"step\":\"Think\",\"model\":\"claude-sonnet-4.5\",\"input_tokens\":10000,\"output_tokens\":2000,\"cached_tokens\":0,\"requests\":2,\"cost_usd\":0.06} -->",
      "# Plan: Spec\n\n---\n<!-- ai-cost-step:{\"step\":\"Plan\",\"model\":\"claude-sonnet-4.5\",\"input_tokens\":20000,\"output_tokens\":4000,\"cached_tokens\":0,\"requests\":3,\"cost_usd\":0.12} -->"
    ]
    proj_num = project
    proj_num['data']['repository']['owner']['projectsV2']['nodes'].first['fields'] = {
      'nodes' => [{}, { 'id' => 'COST_NUM', 'name' => 'AI Cost', 'dataType' => 'NUMBER' }]
    }
    run_step(status_step('code', 'Code'), scenario(['5-release'], comments: comments, project: proj_num))
    cost_mutation = @calls.find { |args| args.include?('fieldId=COST_NUM') }
    refute_nil cost_mutation
    assert_includes cost_mutation, 'val=0.18'

    proj_text = project
    proj_text['data']['repository']['owner']['projectsV2']['nodes'].first['fields'] = {
      'nodes' => [{ 'id' => 'COST_TXT', 'name' => 'AI Cost', 'dataType' => 'TEXT' }]
    }
    run_step(status_step('release', 'Done'), scenario(['5-release'], comments: comments, project: proj_text))
    text_mutation = @calls.find { |args| args.include?('fieldId=COST_TXT') }
    refute_nil text_mutation
    assert_includes text_mutation, 'val=$0.1800'
  end

  def test_ai_cost_uses_copilot_nano_aiu_credits_without_multi_counting_checkpoints
    copilot_bin = File.join(@directory, 'bin/copilot')
    session_dir = File.join(@directory, '.copilot/session-state/s1')
    File.write(copilot_bin, <<~RUBY)
      #!#{RbConfig.ruby}
      require 'fileutils'
      require 'json'
      dir = #{session_dir.inspect}
      FileUtils.mkdir_p(dir)
      File.write(File.join(dir, 'events.jsonl'), [
        JSON.generate({
          'type' => 'session.usage_record',
          'data' => {
            'usage' => {
              'model' => 'gpt-6.1-sol',
              'inputTokens' => 27_741,
              'outputTokens' => 68,
              'cacheReadTokens' => 0,
              'cacheWriteTokens' => 27_738,
              'copilotUsage' => { 'totalNanoAiu' => 4_902_170_000 }
            }
          }
        }),
        JSON.generate({
          'type' => 'session.usage_record',
          'data' => {
            'usage' => {
              'model' => 'gpt-6.1-sol',
              'inputTokens' => 27_914,
              'outputTokens' => 26,
              'cacheReadTokens' => 27_738,
              'cacheWriteTokens' => 173,
              'copilotUsage' => { 'totalNanoAiu' => 243_061_000 }
            }
          }
        }),
        JSON.generate({
          'type' => 'session.usage_checkpoint',
          'data' => {
            'accountingSnapshot' => {
              'modelMetrics' => {
                'gpt-6.1-sol' => {
                  'usage' => { 'inputTokens' => 55_655, 'outputTokens' => 94, 'cacheReadTokens' => 27_738 }
                }
              }
            }
          }
        }),
        JSON.generate({
          'type' => 'session.shutdown',
          'data' => {
            'accountingSnapshot' => {
              'modelMetrics' => {
                'gpt-6.1-sol' => {
                  'usage' => { 'inputTokens' => 55_655, 'outputTokens' => 94, 'cacheReadTokens' => 27_738 }
                }
              }
            }
          }
        })
      ].join("\\n") + "\\n")
    RUBY
    File.chmod(0o755, copilot_bin)

    data = scenario(['1-think'])
    data['issue']['title'] = 'Avoid multi-counting tokens'
    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))
    File.write(File.join(@directory, 'specs/issue-42/think.md'), "# Think: Credits\n\n## Problem\nAccurate cost.")

    think_agent_step = steps('think').find { |item| item['name'] == 'Fetch issue context and run Thinker agent' }
    run_step(think_agent_step, data)
    cost_step_md = File.read(File.join(@directory, 'specs/issue-42/ai-cost-step.md'))
    assert_includes cost_step_md, '<!-- ai-cost-step:{"step":"Think","model":"gpt-6.1-sol","input_tokens":55655,"output_tokens":94,"cached_tokens":27738,"requests":2,"cost_usd":0.0515} -->'
    assert_includes cost_step_md, '💰 **AI Cost (Think):** `$0.0515` (`gpt-6.1-sol` · 55655 in / 94 out tokens · 2 requests)'
  end

  def test_code_exit_gates_auto_commit_in_scope_edits_and_reject_empty_branches
    prepare_stale_pr
    specs = File.join(@repository, 'specs/issue-42')
    FileUtils.mkdir_p(specs)
    File.write(File.join(specs, 'think.md'), <<~MD)
      # Think: Add crates

      ## Blast Radius & Rollback
      - **Tier:** Low
      - **Rollback:** _None._
    MD
    File.write(File.join(specs, 'plan.md'), <<~MD)
      # Plan: Add crates

      ## File Scope & Boundaries
      - **In Scope:** `src/crate.js`, `tests/crate.test.js`
      - **Out of Scope:** `src/other.js`

      ## Acceptance Criteria
      - **AC-1:** Crate spawns health.

      ## Blast Radius & Rollback
      - **Tier:** Low
      - **Rollback:** _None._
    MD
    File.write(File.join(@repository, 'pr.md'), "valid pr body\n")
    validate_dir = File.join(@repository, '.agents/skills/code/scripts')
    FileUtils.mkdir_p(validate_dir)
    File.write(File.join(validate_dir, 'validate-pr.mjs'), "export const TIERS = ['Low', 'Medium', 'High', 'Critical'];\nexport function readPlan() { return { tier: 'Low', criteria: ['AC-1'] }; }\nexport function readThink() { return { tier: 'Low', rollback: '_None._' }; }\n")

    # 1. Reset feature branch to match origin/main with no edits -> should fail with explicit error and record detailed failure reason
    git_command('checkout', '-B', 'feature/issue-42-crates', 'refs/remotes/origin/main')
    File.write(File.join(@directory, 'copilot-code.log'), "Agent started\nError: model quota or empty edit\n")
    File.write(File.join(@repository, 'src_untracked_out_of_scope.js'), "export const stray = 1;\n")
    entry = steps('code').find { |item| item['name'] == 'Run deterministic Code exit gates' }
    data = scenario.merge('issue' => { 'title' => 'Add crates' })
    File.write(@environment.fetch('TEST_SCENARIO'), JSON.generate(data))
    File.write(@environment.fetch('TEST_CALLS'), '')
    File.write(@environment.fetch('TEST_VIOLATIONS'), '')
    env = @environment.merge(resolve_step_environment(entry)).merge(
      'PATH' => "#{@environment.fetch('PATH')}#{File::PATH_SEPARATOR}#{ENV.fetch('PATH')}",
      'BASE_REF' => 'main', 'BRANCH_NAME' => 'feature/issue-42-crates'
    )
    output, error, status = Open3.capture3(
      env, 'bash', '--noprofile', '--norc', '-eo', 'pipefail',
      stdin_data: entry.fetch('run'), chdir: @repository, unsetenv_others: true
    )
    refute status.success?
    assert_includes "#{output}\n#{error}", 'Code Agent produced no commits or in-scope file changes'
    reason_file = File.join(@directory, 'code-failure-reason.md')
    assert File.file?(reason_file), 'Exit gate failure must write code-failure-reason.md'
    reason_md = File.read(reason_file)
    assert_includes reason_md, 'produced no commits or in-scope file changes'
    assert_includes reason_md, '`src/crate.js`, `tests/crate.test.js`'
    assert_includes reason_md, '`src_untracked_out_of_scope.js`'
    assert_includes reason_md, '<details><summary>Copilot CLI output (last 30 lines)</summary>'
    assert_includes reason_md, 'Error: model quota or empty edit'

    fail_step = steps('code').find { |item| item['name'] == 'Mark issue needs:developer if Code fails' }
    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))
    File.write(File.join(@directory, 'specs/issue-42/ai-cost-step.md'), "\n\n---\n<!-- ai-cost-step:{\"step\":\"Code\",\"cost_usd\":0.12} -->\n💰 **AI Cost (Code):** `$0.1200`")
    run_step(fail_step, data)
    comment_call = @calls.find { |args| args.first(2) == %w[issue comment] }
    refute_nil comment_call
    posted_failure = File.read(comment_call[comment_call.index('--body-file') + 1])
    assert_includes posted_failure, '⚠️ **Code failed — issue stays in Code with `needs:developer`**'
    assert_includes posted_failure, '`src/crate.js`, `tests/crate.test.js`'
    assert_includes posted_failure, '`src_untracked_out_of_scope.js`'
    assert_includes posted_failure, 'Error: model quota or empty edit'
    assert_includes posted_failure, '💰 **AI Cost (Code):** `$0.1200`'
    FileUtils.rm_f(File.join(@repository, 'src_untracked_out_of_scope.js'))

    # 2. Agent leaves uncommitted in-scope changes -> exit gate auto-stages and commits them
    FileUtils.mkdir_p(File.join(@repository, 'src'))
    File.write(File.join(@repository, 'src/crate.js'), "export const crate = true;\n")
    File.write(File.join(@repository, 'src/other.js'), "export const outOfScope = true;\n")
    output, error, status = Open3.capture3(
      env, 'bash', '--noprofile', '--norc', '-eo', 'pipefail',
      stdin_data: entry.fetch('run'), chdir: @repository, unsetenv_others: true
    )
    assert status.success?, "#{output}\n#{error}"
    refute_empty git_command('log', 'refs/remotes/origin/main..HEAD', '--oneline')
    committed_files = git_command('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').lines.map(&:strip)
    assert_equal ['src/crate.js'], committed_files

    # 3. Successful Code PR creation posts # Code: comment with PR link and final Code Agent output summary (excluding tool logs and CLI footer)
    status_script = status_step('code', 'Code').fetch('run').split("<<'STATUS_SCRIPT'\n", 2).last.split("\nSTATUS_SCRIPT", 2).first
    File.write(File.join(@directory, 'code-project-status.sh'), status_script)
    pr_step = steps('code').find { |item| item['name'] == 'Enter Prove and create or update Pull Request' }
    pr_data = scenario(['5-release'], project: project, pr: { 'number' => 99, 'url' => 'https://example.test/pr/99' }).merge('issue' => { 'title' => 'Add crates' })
    File.write(@environment.fetch('TEST_SCENARIO'), JSON.generate(pr_data))
    File.write(@environment.fetch('TEST_CALLS'), '')
    File.write(@environment.fetch('TEST_VIOLATIONS'), '')
    File.write(
      File.join(@directory, 'copilot-code.log'),
      "● Read plan.md\n  │ specs/issue-42/plan.md\n  └ 10 lines read\n\nI will now implement src/crate.js.\n\n● Create src/crate.js +1\n\nImplemented src/crate.js\nAll tests pass\n\nChanges    +10 -0\nAI Credits 1.23 (10s)\nTokens     ↑ 10k • ↓ 1k\nResume     copilot --resume=12345678-1234-1234-1234-123456789abc\n"
    )
    pr_env = @environment.merge(resolve_step_environment(pr_step)).merge(
      'PATH' => "#{@environment.fetch('PATH')}#{File::PATH_SEPARATOR}#{ENV.fetch('PATH')}",
      'BASE_REF' => 'main', 'BRANCH_NAME' => 'feature/issue-42-crates'
    )
    pr_out, pr_err, pr_status = Open3.capture3(
      pr_env, 'bash', '--noprofile', '--norc', '-eo', 'pipefail',
      stdin_data: pr_step.fetch('run'), chdir: @repository, unsetenv_others: true
    )
    assert pr_status.success?, "#{pr_out}\n#{pr_err}"
    pr_calls = File.readlines(@environment.fetch('TEST_CALLS')).map { |line| JSON.parse(line) }
    code_comment_call = pr_calls.find { |args| args.first(2) == %w[issue comment] }
    refute_nil code_comment_call
    code_comment_body = File.read(code_comment_call[code_comment_call.index('--body-file') + 1])
    assert_includes code_comment_body, '# Code: Add crates'
    assert_includes code_comment_body, 'Pull request opened for #42:'
    assert_includes code_comment_body, "Implemented src/crate.js\nAll tests pass"
    refute_includes code_comment_body, '● Read plan.md'
    refute_includes code_comment_body, 'I will now implement src/crate.js.'
    refute_includes code_comment_body, 'copilot --resume='
    refute_includes code_comment_body, '## Changed Files'
    refute_includes code_comment_body, 'valid pr body'
    refute_includes code_comment_body, '<details>'
  end

  def test_audit_runner_creates_one_issue_per_finding_and_adds_to_project
    audit = YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml'))
    entry = audit.fetch('jobs').fetch('audit').fetch('steps').find { |item| item['id'] == 'create_findings' }
    refute_nil entry

    File.write(File.join(@directory, 'audit-findings.json'), JSON.generate([
      {
        'title' => 'chore(dead-code): remove unused parseLegacyConfig helper',
        'priority' => 'Low',
        'model' => 'claude-haiku-5.5',
        'effort' => 'Low',
        'body' => "## Problem\n`parseLegacyConfig` in `src/config.js` has zero call sites.\n\n## Affected Files\n- `src/config.js`\n\n## Suggested Remediation\nDelete `parseLegacyConfig`."
      },
      {
        'title' => 'chore(dead-code): remove duplicate open issue',
        'body' => 'Already tracked.'
      }
    ]))

    data = scenario(
      [],
      issues: [{ 'number' => 15, 'title' => 'CHORE(DEAD-CODE): REMOVE DUPLICATE OPEN ISSUE' }],
      project: project
    )
    output = run_step(entry, data)
    assert_equal '1', output.fetch('created_count')

    create_calls = @calls.select { |args| args.first(2) == %w[issue create] }
    assert_equal 1, create_calls.length
    create_call = create_calls.first
    assert_includes create_call, 'chore(dead-code): remove unused parseLegacyConfig helper'
    assert_includes create_call, 'audit:dead-code'
    LABELS.each { |label| refute_includes create_call, label }

    field_calls = @calls.select { |args| args.any? { |arg| arg.include?('setIssueFieldValue') } }
    assert_equal 3, field_calls.length, 'Audit-created issues must set Priority, Model, and Effort organization issue fields'
    %w[issueId=ISSUE fieldId=PRIORITY_FIELD optionId=prio_low].each { |arg| assert_includes field_calls[0], arg }
    %w[issueId=ISSUE fieldId=MODEL_FIELD optionId=model_claude-haiku-5.5].each { |arg| assert_includes field_calls[1], arg }
    %w[issueId=ISSUE fieldId=EFFORT_FIELD optionId=effort_low].each { |arg| assert_includes field_calls[2], arg }

    add_item_calls = @calls.select { |args| args.any? { |arg| arg.include?('addProjectV2ItemById') } }
    assert_equal 1, add_item_calls.length
    assert_includes add_item_calls.first, 'projectId=PROJECT'
    assert_includes add_item_calls.first, 'contentId=ISSUE'
    status_calls = @calls.select { |args| args.any? { |arg| arg.include?('updateProjectV2ItemFieldValue') } }
    assert_equal 1, status_calls.length, 'Audit-created issues must be placed in Triage status on the Project board'
    %w[projectId=PROJECT itemId=ITEM fieldId=STATUS optionId=triage].each { |arg| assert_includes status_calls.first, arg }

    report = File.read(File.join(@directory, 'audit-report.md'))
    assert_includes report, 'chore(dead-code): remove unused parseLegacyConfig helper'
    refute File.exist?(File.join(@directory, 'audit-findings.json'))

    # Verify auto-added project items ("gh: Content already exists in this project") do not abort issue creation,
    # omitted priority/model/effort default to Medium/claude-sonnet-5.5/Medium, and collapsed 1-liner bodies / structured fields are normalized
    File.write(File.join(@directory, 'audit-findings.json'), JSON.generate([
      {
        'title' => 'test(gap): add unit test for pause toggle',
        'priority' => 'High',
        'model' => 'claude-opus-5.5',
        'effort' => 'High',
        'body' => '## Problem: Missing pause test. ## Affected Files: - `src/pause.js` ## Suggested Fix: Add pause unit test. - **AC-1:** Pause toggle is covered.'
      },
      {
        'title' => 'test(gap): add unit test for door prompt',
        'problem' => 'Missing door prompt test.',
        'affectedFiles' => ['src/door.js'],
        'suggestedFix' => 'Add door prompt unit test.',
        'acceptanceCriteria' => ['**AC-1:** Door prompt is covered.']
      }
    ]))
    data_auto_added = scenario([], issues: [], project: project).merge('content_already_exists' => true)
    output_auto_added = run_step(entry, data_auto_added)
    assert_equal '2', output_auto_added.fetch('created_count')
    created_bodies = @calls.select { |args| args.first(2) == %w[issue create] }.map { |args| args[args.index('--body') + 1] }
    assert_includes created_bodies[0], "## Problem\n\nMissing pause test.\n\n## Affected Files\n\n- `src/pause.js`\n\n## Suggested Fix\n\nAdd pause unit test.\n\n## Acceptance Criteria\n\n- **AC-1:** Pause toggle is covered."
    assert_includes created_bodies[1], "## Problem\n\nMissing door prompt test.\n\n## Affected Files\n\n- `src/door.js`\n\n## Suggested Fix\n\nAdd door prompt unit test.\n\n## Acceptance Criteria\n\n- **AC-1:** Door prompt is covered."
    auto_field_calls = @calls.select { |args| args.any? { |arg| arg.include?('setIssueFieldValue') } }
    assert_equal 6, auto_field_calls.length
    %w[issueId=ISSUE fieldId=PRIORITY_FIELD optionId=prio_high].each { |arg| assert_includes auto_field_calls[0], arg }
    %w[issueId=ISSUE fieldId=MODEL_FIELD optionId=model_claude-opus-5.5].each { |arg| assert_includes auto_field_calls[1], arg }
    %w[issueId=ISSUE fieldId=EFFORT_FIELD optionId=effort_high].each { |arg| assert_includes auto_field_calls[2], arg }
    %w[issueId=ISSUE fieldId=PRIORITY_FIELD optionId=prio_medium].each { |arg| assert_includes auto_field_calls[3], arg }
    %w[issueId=ISSUE fieldId=MODEL_FIELD optionId=model_claude-sonnet-5.5].each { |arg| assert_includes auto_field_calls[4], arg }
    %w[issueId=ISSUE fieldId=EFFORT_FIELD optionId=effort_medium].each { |arg| assert_includes auto_field_calls[5], arg }
    auto_status_calls = @calls.select { |args| args.any? { |arg| arg.include?('updateProjectV2ItemFieldValue') } }
    assert_equal 2, auto_status_calls.length
    %w[projectId=PROJECT itemId=ITEM fieldId=STATUS optionId=triage].each { |arg| assert_includes auto_status_calls.first, arg }
  end

  def test_audit_preflight_skips_scheduled_runs_when_idle_or_backlog_full_and_fleet_dispatches
    audit = YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml'))
    preflight = audit.fetch('jobs').fetch('audit').fetch('steps').find { |item| item['id'] == 'preflight' }
    refute_nil preflight

    git_bin = File.join(@directory, 'bin/git')
    # 1. Manual workflow_dispatch always runs regardless of git log or backlog
    File.write(git_bin, "#!#{RbConfig.ruby}\nexit 0\n")
    File.chmod(0o755, git_bin)
    out_manual = run_step(preflight, scenario, { 'EVENT_NAME' => 'workflow_dispatch' })
    assert_equal 'false', out_manual.fetch('skip')

    # 2. Scheduled run with no commits in last 7 days skips immediately
    out_idle = run_step(preflight, scenario, { 'EVENT_NAME' => 'schedule' })
    assert_equal 'true', out_idle.fetch('skip')
    assert_empty @calls

    # 3. Scheduled run on a private repository skips immediately even with recent commits
    File.write(git_bin, "#!#{RbConfig.ruby}\nputs 'abc1234'\n")
    File.chmod(0o755, git_bin)
    out_private = run_step(preflight, scenario, { 'EVENT_NAME' => 'schedule', 'REPO_PRIVATE' => 'true' })
    assert_equal 'true', out_private.fetch('skip')
    assert_empty @calls

    # 4. Scheduled run with recent commit but >= 10 open audit issues skips
    ten_issues = (1..10).map { |n| { 'number' => n } }
    out_backlog = run_step(preflight, scenario([], issues: ten_issues), { 'EVENT_NAME' => 'schedule' })
    assert_equal 'true', out_backlog.fetch('skip')

    # 5. Scheduled run with recent commit and < 10 open audit issues proceeds
    out_active = run_step(preflight, scenario([], issues: [{ 'number' => 1 }]), { 'EVENT_NAME' => 'schedule' })
    assert_equal 'false', out_active.fetch('skip')

    # 6. Fleet dispatcher triggers audits.yml on every fleet repository (FLEET_REPOS_DEFAULT), skips private
    # repositories in `all` dispatches and runs no per-repository applicability filter any more.
    fleet = YAML.load_file(File.join(ROOT, '.github/workflows/audit-fleet.yml'))
    assert_equal 'Megadex Foxnox Gatelin', fleet.dig('env', 'FLEET_REPOS_DEFAULT')
    assert_equal %w[all dependency-audit dead-code-audit test-gap-audit docs-sync-audit a11y-audit token-audit],
                 (fleet['on'] || fleet.fetch(true)).dig('workflow_dispatch', 'inputs', 'audit', 'options')
    dispatch_step = fleet.fetch('jobs').fetch('dispatch').fetch('steps').find { |item| item['id'] == 'dispatch_fleet' }
    refute_nil dispatch_step
    fleet_env = { 'OWNER' => 'ALTEN-group', 'FLEET_REPOS' => '', 'SCOPE' => 'src/', 'DEPENDENCY' => 'all',
                  'FLEET_REPOS_DEFAULT' => fleet.dig('env', 'FLEET_REPOS_DEFAULT') }

    out_all = run_step(dispatch_step, scenario([], private_repos: ['ALTEN-group/Gatelin']), fleet_env.merge('TARGET' => 'all', 'AUDIT' => 'all'))
    assert_equal '2', out_all.fetch('dispatched_count')
    assert_equal [
      ['workflow', 'run', 'audits.yml', '--repo', 'ALTEN-group/Megadex', '-f', 'audit=all', '-f', 'scope=src/', '-f', 'dependency=all'],
      ['workflow', 'run', 'audits.yml', '--repo', 'ALTEN-group/Foxnox', '-f', 'audit=all', '-f', 'scope=src/', '-f', 'dependency=all']
    ], dispatches

    %w[docs-sync-audit a11y-audit token-audit].each do |audit_name|
      out_each = run_step(dispatch_step, scenario, fleet_env.merge('TARGET' => 'all', 'AUDIT' => audit_name))
      assert_equal '3', out_each.fetch('dispatched_count'), "#{audit_name} is dispatched to every fleet repository"
      assert_equal %w[Megadex Foxnox Gatelin], dispatches.map { |args| args[4].split('/').last }
      assert dispatches.all? { |args| args.include?("audit=#{audit_name}") }
    end

    out_one = run_step(dispatch_step, scenario([], private_repos: ['ALTEN-group/Foxnox']), fleet_env.merge('TARGET' => 'Foxnox', 'AUDIT' => 'dependency-audit', 'DEPENDENCY' => 'express', 'SCOPE' => ''))
    assert_equal '1', out_one.fetch('dispatched_count'), 'A single named target is dispatched even when private'
    assert_equal [['workflow', 'run', 'audits.yml', '--repo', 'ALTEN-group/Foxnox', '-f', 'audit=dependency-audit', '-f', 'scope=', '-f', 'dependency=express']], dispatches

    out_variable = run_step(dispatch_step, scenario, fleet_env.merge('TARGET' => 'all', 'AUDIT' => 'all', 'FLEET_REPOS' => 'Megadex'))
    assert_equal '1', out_variable.fetch('dispatched_count'), 'The FLEET_REPOS variable overrides the default fleet'

    run_step(dispatch_step, scenario, fleet_env.merge('TARGET' => 'SomethingElse', 'AUDIT' => 'all'), success: false)
    assert_empty dispatches, 'Unknown targets dispatch nothing'
  end

  def test_audit_finding_issues_skip_think_and_synthesize_valid_think_spec
    # 1. pipeline-plan.yml on an audit:* issue labeled 2-plan synthesizes think.md silently on disk without posting a # Think: comment or dispatching think.yml
    plan_resolve = step('plan', 'resolve')
    audit_plan_data = scenario(%w[audit:test-gap 2-plan], comments: [])
    audit_plan_data['issue']['title'] = 'Add unit tests for Raycaster'
    audit_plan_data['issue']['body'] = "## Problem\nMissing test coverage in `src/engine/Raycaster.js`.\n\n---\n_Reported by `test-gap` audit in `src/`._"
    out_plan = run_step(plan_resolve, audit_plan_data)
    assert_equal 'false', out_plan.fetch('skip')
    assert_empty dispatches
    synthesized_think = File.read('/tmp/specs/issue-42/think.md')
    assert_includes synthesized_think, '# Think: Add unit tests for Raycaster'
    assert_includes synthesized_think, 'audit:test-gap'
    assert_includes synthesized_think, '`src/engine/Raycaster.js`'
    assert_includes synthesized_think, '`tests/`'
    assert_includes synthesized_think, 'Automated by coding-pal-audit on '
    assert_includes synthesized_think, '- **Docs:** _None._ - Scoped audit remediation does not change public APIs or user-facing documentation.'
    refute @calls.any? { |args| args.first(2) == %w[issue comment] }, 'Plan must not post a # Think: comment on the issue'

    # 2. pipeline-code.yml on an audit:* issue labeled 5-release without plan.md dispatches plan.yml directly (skipping think.yml)
    code_resolve = step('code', 'resolve')
    audit_code_data = scenario(%w[audit:test-gap 5-release], comments: [])
    out_code = run_step(code_resolve, audit_code_data)
    assert_equal 'true', out_code.fetch('skip')
    assert_equal [['workflow', 'run', 'plan.yml', '-f', 'issue_number=42']], dispatches

    # 2b. pipeline-code.yml on an audit:* issue with # Plan: comment (and no # Think: comment) proceeds directly with silent local think.md
    audit_code_planned = scenario(%w[audit:test-gap 3-code], comments: ["# Plan: Feature\n"])
    out_code_planned = run_step(code_resolve, audit_code_planned)
    assert_equal 'false', out_code_planned.fetch('skip')
    assert File.exist?('/tmp/specs/issue-42/think.md')
    refute @calls.any? { |args| args.first(2) == %w[issue comment] }

    # 3. pipeline-think.yml on an audit:* issue explicitly labeled 1-think runs Think normally (resumed_stage=none)
    think_resume = step('think', 'resume')
    audit_think_explicit = scenario(%w[audit:dead-code 1-think], comments: [])
    audit_think_explicit['issue']['title'] = 'Remove dead helper'
    out_think_explicit = run_step(think_resume, audit_think_explicit)
    assert_equal 'none', out_think_explicit.fetch('resumed_stage')

    # 4. pipeline-think.yml on an audit:* issue without 1-think (e.g. 2-plan) skips Think and fast-forwards to plan without commenting # Think:
    audit_think_skip = scenario(%w[audit:dead-code 2-plan], comments: [])
    audit_think_skip['issue']['title'] = 'Remove dead helper'
    out_think_skip = run_step(think_resume, audit_think_skip)
    assert_equal 'plan', out_think_skip.fetch('resumed_stage')
    assert File.exist?(File.join(@directory, 'specs/issue-42/think.md'))
    refute @calls.any? { |args| args.first(2) == %w[issue comment] }
  end

  def test_plan_short_circuits_already_resolved_issues_and_enforces_test_files_in_scope
    already_resolved = step('plan', 'already_resolved')
    FileUtils.mkdir_p(File.join(@directory, 'specs/issue-42'))

    # 1. Normal unresolved issue: resolved=false and no GitHub calls
    out_unresolved = run_step(already_resolved, scenario)
    assert_equal 'false', out_unresolved.fetch('resolved')
    assert_empty @calls

    # 2. Already resolved on base branch: comments with AI cost, strips labels, closes issue, and moves Project item to Done
    File.write(File.join(@directory, 'specs/issue-42/already-resolved.json'), JSON.generate({
      'resolved' => true,
      'summary' => '`KEYCARD_COLORS` in `src/keycard.js` was already removed by PR #115 (#107).'
    }))
    File.write(File.join(@directory, 'specs/issue-42/ai-cost-step.md'), "\n\n---\n<!-- ai-cost-step:{\"step\":\"Plan\",\"cost_usd\":0.04} -->\n💰 **AI Cost (Plan):** `$0.0400`")
    out_resolved = run_step(already_resolved, scenario(%w[5-release], project: project), {
      'PROJECT_ID' => 'PROJECT', 'PROJECT_ITEM_ID' => 'ITEM', 'STATUS_FIELD_ID' => 'STATUS', 'DONE_OPTION_ID' => 'done'
    })
    assert_equal 'true', out_resolved.fetch('resolved')
    comment_call = @calls.find { |args| args.first(2) == %w[issue comment] }
    refute_nil comment_call
    assert_includes comment_call.last, 'Already Resolved on Base Branch'
    assert_includes comment_call.last, '`KEYCARD_COLORS` in `src/keycard.js` was already removed by PR #115 (#107).'
    assert_includes comment_call.last, '💰 **AI Cost (Plan):** `$0.0400`'
    assert @calls.any? { |args| args.first(3) == %w[issue close 42] && args.include?('--reason') && args.include?('completed') }
    assert @calls.any? { |args| args.include?('optionId=done') }

    # 3. Validate plan.md rejects Test Plan files omitted from In Scope and accepts when included
    validate_step = steps('plan').find { |item| item['name'] == 'Validate plan.md contract and cross-check against think.md' }
    scope_snippet = validate_step.fetch('run')[/node -e '\s*(const fs = require\("fs"\);.*?)' "\$PLAN_FILE"/m, 1]
    refute_nil scope_snippet
    bad_plan = File.join(@directory, 'bad_plan.md')
    File.write(bad_plan, <<~MD)
      # Plan: Remove dead KEYCARD_COLORS export

      ## File Scope & Boundaries
      - **In Scope:** `src/keycard.js`
      - **Out of Scope:** `tests/`

      ## Test Plan
      | Test | Type | Verify |
      | --- | --- | --- |
      | `tests/exports.test.mjs`: AC-1 keycard exports | unit | `npm test` |
    MD
    _, err_bad, status_bad = Open3.capture3('node', '-e', scope_snippet, bad_plan)
    refute status_bad.success?
    assert_includes err_bad, 'tests/exports.test.mjs'

    good_plan = File.join(@directory, 'good_plan.md')
    File.write(good_plan, <<~MD)
      # Plan: Remove dead KEYCARD_COLORS export

      ## File Scope & Boundaries
      - **In Scope:** `src/keycard.js`, `tests/exports.test.mjs`
      - **Out of Scope:** `src/world.js`

      ## Test Plan
      | Test | Type | Verify |
      | --- | --- | --- |
      | `tests/exports.test.mjs`: AC-1 keycard exports | unit | `npm test` |
    MD
    _, err_good, status_good = Open3.capture3('node', '-e', scope_snippet, good_plan)
    assert status_good.success?, err_good
  end

  def test_audit_runner_deduplicates_overlapping_symbol_and_file_findings
    audit = YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml'))
    create_entry = audit.fetch('jobs').fetch('audit').fetch('steps').find { |item| item['id'] == 'create_findings' }

    File.write(File.join(@directory, 'audit-findings.json'), JSON.generate([
      {
        'title' => 'chore(dead-code): remove unused export constants and dead tint vectors',
        'priority' => 'Low',
        'problem' => 'Dead export `KEYCARD_COLORS` in `src/keycard.js` has zero call sites.',
        'affectedFiles' => ['src/keycard.js'],
        'suggestedFix' => 'Remove `KEYCARD_COLORS` from `src/keycard.js`.',
        'acceptanceCriteria' => ['- **AC-1:** `KEYCARD_COLORS` is removed.']
      }
    ]))

    existing_issues = [
      {
        'number' => 60,
        'title' => 'chore(keycard): remove dead KEYCARD_COLORS export',
        'body' => "## Problem\n\n`KEYCARD_COLORS` in `src/keycard.js` is never imported.\n\n## Affected Files\n\n- `src/keycard.js`"
      }
    ]
    out = run_step(create_entry, scenario([], issues: existing_issues, project: project))
    assert_equal '0', out.fetch('created_count')
    refute @calls.any? { |args| args.first(2) == %w[issue create] }, 'Overlapping file + symbol finding must be skipped'
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }, 'Different-title overlapping finding must not overwrite existing issue body'
  end

  def test_audit_runner_merges_close_findings_before_creating_issues
    audit = YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml'))
    steps_list = audit.fetch('jobs').fetch('audit').fetch('steps')
    create_entry = steps_list.find { |item| item['id'] == 'create_findings' }

    # 1. Three close findings (same file src/raycaster.js, paired test file tests/raycaster.test.js) merge into 1 issue,
    #    while an unrelated finding in src/audio.js stays a separate issue (total created_count = 2).
    File.write(File.join(@directory, 'audit-findings.json'), JSON.generate([
      {
        'title' => 'perf(raycaster): avoid per-frame array allocation in castRay',
        'priority' => 'Medium',
        'model' => 'claude-haiku-5.5',
        'effort' => 'Low',
        'problem' => '`castRay` allocates a temporary hit array every frame.',
        'affectedFiles' => ['src/raycaster.js'],
        'suggestedFix' => 'Preallocate a module-scoped scratch buffer in `src/raycaster.js`.',
        'acceptanceCriteria' => ['- **AC-1:** `castRay` reuses a preallocated scratch buffer.']
      },
      {
        'title' => 'perf(raycaster): reuse hit normal vector in castWall',
        'priority' => 'High',
        'model' => 'claude-opus-5.5',
        'effort' => 'High',
        'problem' => '`castWall` instantiates a new normal vector on every wall hit.',
        'affectedFiles' => ['src/raycaster.js'],
        'suggestedFix' => 'Mutate a scratch normal vector in place during `castWall`.',
        'acceptanceCriteria' => ['- **AC-1:** `castWall` mutates a scratch normal vector without allocating.']
      },
      {
        'title' => 'perf(raycaster): add zero-allocation benchmark assertion',
        'priority' => 'Low',
        'model' => 'claude-sonnet-5.5',
        'effort' => 'Medium',
        'problem' => 'Raycaster test suite does not assert zero per-frame allocations.',
        'affectedFiles' => ['tests/raycaster.test.js'],
        'suggestedFix' => 'Add a spy assertion in `tests/raycaster.test.js`.',
        'acceptanceCriteria' => ['- **AC-1:** `tests/raycaster.test.js` verifies zero allocations.']
      },
      {
        'title' => 'perf(audio): pool gain nodes in playSfx',
        'priority' => 'Low',
        'model' => 'claude-haiku-5.5',
        'effort' => 'Low',
        'problem' => '`playSfx` creates unpooled nodes.',
        'affectedFiles' => ['src/audio.js'],
        'suggestedFix' => 'Pool nodes in `src/audio.js`.',
        'acceptanceCriteria' => ['- **AC-1:** `playSfx` reuses pooled nodes.']
      }
    ]))

    out = run_step(create_entry, scenario([], issues: [], project: project))
    assert_equal '2', out.fetch('created_count')

    create_calls = @calls.select { |args| args.first(2) == %w[issue create] }
    assert_equal 2, create_calls.length

    raycaster_call = create_calls[0]
    raycaster_title = raycaster_call[raycaster_call.index('--title') + 1]
    raycaster_body = raycaster_call[raycaster_call.index('--body') + 1]
    assert_equal 'perf(raycaster): avoid per-frame array allocation in castRay; reuse hit normal vector in castWall; add zero-allocation benchmark assertion', raycaster_title
    assert_includes raycaster_body, '`castRay` allocates a temporary hit array every frame.'
    assert_includes raycaster_body, '`castWall` instantiates a new normal vector on every wall hit.'
    assert_includes raycaster_body, "- `src/raycaster.js`\n- `tests/raycaster.test.js`"
    assert_includes raycaster_body, "- **AC-1:** `castRay` reuses a preallocated scratch buffer.\n- **AC-2:** `castWall` mutates a scratch normal vector without allocating.\n- **AC-3:** `tests/raycaster.test.js` verifies zero allocations."

    field_calls = @calls.select { |args| args.any? { |arg| arg.include?('setIssueFieldValue') } }
    assert_equal 6, field_calls.length
    # First (merged raycaster) issue gets highest Priority (High), highest Model (claude-opus-5.5), and highest Effort (High)
    %w[issueId=ISSUE fieldId=PRIORITY_FIELD optionId=prio_high].each { |arg| assert_includes field_calls[0], arg }
    %w[issueId=ISSUE fieldId=MODEL_FIELD optionId=model_claude-opus-5.5].each { |arg| assert_includes field_calls[1], arg }
    %w[issueId=ISSUE fieldId=EFFORT_FIELD optionId=effort_high].each { |arg| assert_includes field_calls[2], arg }
  end

  INSTALL_SCRIPT = File.join(ROOT, 'scripts/factory/install-primitives.sh')

  # { 'prove' => { agents: [...], instructions: [...], skills: [...] } } read from the stage table of the install script.
  def stage_definitions
    File.read(INSTALL_SCRIPT).scan(/^\s+(think|plan|code|prove)\)\s+STAGE_DEF="([^"]*)"/).to_h do |stage, definition|
      agents, instructions, skills = definition.split('|', 3).map(&:split)
      [stage, { agents: agents, instructions: instructions, skills: skills }]
    end
  end

  def install_step(phase)
    steps(phase).find { |item| item['name'] == "Install coding-pal #{phase} primitives" } ||
      raise("Missing install step in #{phase}")
  end

  def test_primitive_validators_and_agents_are_wired_across_phases
    stages = stage_definitions
    assert_equal %w[think plan code prove], stages.keys
    assert_equal %w[think], stages.dig('think', :agents)
    assert_includes stages.dig('think', :skills), 'decision-record'
    assert_includes stages.dig('think', :instructions), 'decision-record'
    assert_equal %w[plan], stages.dig('plan', :agents)
    assert_includes stages.dig('plan', :skills), 'think'
    assert_equal %w[code], stages.dig('code', :agents)
    assert_equal %w[think plan code prove], stages.dig('code', :skills).first(4)
    assert_equal %w[prove gate-fix], stages.dig('prove', :agents)
    refute_includes stages.dig('prove', :agents), 'code'
    assert_equal %w[think plan code prove], stages.dig('prove', :skills).first(4)
    stages.each_value do |definition|
      definition[:agents].each { |agent| assert File.file?(File.join(ROOT, "agents/#{agent}.agent.md")), "agent #{agent}" }
      definition[:instructions].each { |name| assert File.file?(File.join(ROOT, "instructions/#{name}.instructions.md")), "instructions #{name}" }
      definition[:skills].each { |skill| assert File.directory?(File.join(ROOT, "skills/#{skill}")), "skill #{skill}" }
    end

    PHASES.each do |phase|
      install = install_step(phase).fetch('run')
      assert_includes install, %(install-primitives.sh" --stage #{phase} --engine "$ENGINE_DIR" --keep-tracked-clean)
      refute_match(/^\s*cp\s/, install, "#{phase}: primitives are installed by the script, not by inline cp lines")
      refute_includes install, 'forge'
      assert_equal '${{ secrets.PIPELINE_GITHUB_TOKEN }}', install_step(phase).dig('env', 'GH_TOKEN')
      assert_equal '${{ inputs.engine_repo }}', install_step(phase).dig('env', 'ENGINE_REPO')
      refute install_step(phase).fetch('env').key?('COPILOT_GITHUB_TOKEN')
    end
    code_entries = steps('code')
    checkout_engine = code_entries.find { |item| item['name'] == 'Check out pipeline engine' }
    refute_nil checkout_engine
    assert_equal 'Check out pipeline engine', code_entries.find { |item| item['run'].to_s.include?('install-primitives.sh') }['name'],
                 'Code checks the engine out first so its own steps can use it'
    assert_operator code_entries.index(checkout_engine), :<, code_entries.index(install_step('code'))

    think_validate = steps('think').find { |item| item['name'] == 'Validate think.md contract' }.fetch('run')
    refute_includes think_validate, 'bindings-check.mjs'
    assert_includes think_validate, 'validate-decision.mjs --think "$THINK_FILE"'
    plan_validate = steps('plan').find { |item| item['name'] == 'Validate plan.md contract and cross-check against think.md' }.fetch('run')
    refute_includes plan_validate, 'bindings-check.mjs'
    code_gates = steps('code').find { |item| item['name'] == 'Run deterministic Code exit gates' }.fetch('run')
    assert_includes code_gates, 'validate-plan.mjs --plan "${SPEC_DIR}/plan.md" --think "${SPEC_DIR}/think.md"'
    assert_includes code_gates, '.agents/skills/code/scripts/validate-pr.mjs'
    prove_loop = steps('prove').find { |item| item['name'] == 'Run Prove validation and auto-remediation loop' }.fetch('run')
    assert_includes prove_loop, '.agents/skills/prove/scripts/verify-criteria.mjs'
    assert_includes prove_loop, '.agents/skills/prove/scripts/dependency-guard.mjs --git --base "origin/${BASE_REF}" --plan "${SPEC_DIR}/plan.md" --pr pr.md'
    assert_includes prove_loop, '--agent="gate-fix"'
    refute_includes prove_loop, '--agent="code"'

    audit_steps = YAML.load_file(File.join(ROOT, '.github/workflows/audit-runner.yml')).fetch('jobs').fetch('audit').fetch('steps')
    audit_install = audit_steps.find { |item| item['name'] == 'Install coding-pal audit primitives' }
    assert_includes audit_install.fetch('run'), 'install-primitives.sh" --stage audit --agent "$AGENT" --engine "$ENGINE_DIR" --keep-tracked-clean'
    refute_match(/^\s*cp\s/, audit_install.fetch('run'))
    assert_equal '${{ inputs.agent }}', audit_install.dig('env', 'AGENT')
    %w[dead-code test-gap docs-sync dependency-leverage token-audit a11y-audit].each do |agent|
      assert File.file?(File.join(ROOT, "agents/#{agent}.agent.md")), "audit agent #{agent} must exist in the engine"
    end
  end

  def write_files(root, names, content = "fixture\n")
    names.each do |name|
      FileUtils.mkdir_p(File.dirname(File.join(root, name)))
      File.write(File.join(root, name), content)
    end
  end

  def build_fake_engine
    engine = File.join(@directory, 'engine-fixture')
    agents = %w[think plan code prove gate-fix token-audit dead-code]
    instructions = %w[think plan code prove decision-record sharp-agent node-express node-unit-tests postgres-liquibase
                      docker angular-admin vitepress-docs]
    skills = %w[think plan code prove release-readiness decision-record vitepress-docs node-express-examples
                postgres-liquibase-examples docker-examples angular-admin-examples]
    write_files(engine, agents.map { |name| "agents/#{name}.agent.md" })
    write_files(engine, instructions.map { |name| "instructions/#{name}.instructions.md" })
    write_files(engine, skills.map { |name| "skills/#{name}/SKILL.md" })
    engine
  end

  def build_fake_app(name, express: true, stack: true)
    app = File.join(@directory, name)
    FileUtils.mkdir_p(app)
    dependencies = express ? { 'express' => '^4.19.0' } : { 'left-pad' => '^1.3.0' }
    File.write(File.join(app, 'package.json'), JSON.generate('name' => name, 'version' => '1.2.2', 'dependencies' => dependencies))
    if stack
      %w[src tests db/liquibase docker admin website].each { |dir| FileUtils.mkdir_p(File.join(app, dir)) }
      File.write(File.join(app, 'admin/angular.json'), '{}')
    end
    write_files(app, %w[.github/agents/old.agent.md .claude/x.md])
    git_command('init', '-q', directory: app)
    git_command('add', '-A', directory: app)
    git_command('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-q', '-m', 'initial', directory: app)
    app
  end

  def run_install_script(app, engine, *arguments)
    Open3.capture3('bash', INSTALL_SCRIPT, '--engine', engine, '--dest', app, *arguments)
  end

  def installed(app, directory)
    Dir.glob(File.join(app, directory, '*')).map { |path| File.basename(path) }.sort
  end

  def test_install_script_installs_only_the_prove_stage_and_detected_stack_primitives
    engine = build_fake_engine
    app = build_fake_app('megadex')
    output, error, status = run_install_script(app, engine, '--stage', 'prove', '--keep-tracked-clean')
    assert status.success?, error
    assert_includes output, 'stage=prove agents=[prove gate-fix]'

    assert_equal %w[gate-fix.agent.md prove.agent.md], installed(app, '.github/agents')
    assert_equal %w[angular-admin-examples code docker-examples node-express-examples plan postgres-liquibase-examples
                    prove release-readiness think vitepress-docs],
                 installed(app, '.agents/skills')
    assert_equal %w[angular-admin.instructions.md docker.instructions.md node-express.instructions.md
                    node-unit-tests.instructions.md postgres-liquibase.instructions.md prove.instructions.md
                    sharp-agent.instructions.md vitepress-docs.instructions.md],
                 installed(app, '.github/instructions')
    refute File.exist?(File.join(app, '.github/agents/old.agent.md')), 'old harness files are wiped'
    refute File.exist?(File.join(app, '.claude')), 'old harness folders are wiped'
    assert File.file?(File.join(app, '.agents/skills/prove/SKILL.md'))

    status_lines = git_command('status', '--porcelain', directory: app).lines.map(&:strip)
    assert_empty status_lines.grep(/\A\S*D\s/), "committed harness files must not show as deleted: #{status_lines.inspect}"

    control = build_fake_app('megadex-control')
    _, error, status = run_install_script(control, engine, '--stage', 'prove')
    assert status.success?, error
    assert git_command('status', '--porcelain', directory: control).lines.any? { |line| line.match?(/\A\s*D\s+\.github\/agents\/old\.agent\.md/) },
           'without --keep-tracked-clean the wipe shows up as a deletion (control)'
  end

  def test_install_script_stage_and_stack_selection
    engine = build_fake_engine
    plain = build_fake_app('foxnox', express: false, stack: false)
    _, error, status = run_install_script(plain, engine, '--stage', 'think')
    assert status.success?, error
    assert_equal %w[think.agent.md], installed(plain, '.github/agents')
    assert_equal %w[decision-record.instructions.md sharp-agent.instructions.md think.instructions.md], installed(plain, '.github/instructions')
    assert_equal %w[decision-record think], installed(plain, '.agents/skills')

    api = build_fake_app('gatelin', stack: false)
    FileUtils.mkdir_p(File.join(api, 'src'))
    _, error, status = run_install_script(api, engine, '--stage', 'plan')
    assert status.success?, error
    assert_includes installed(api, '.github/instructions'), 'node-express.instructions.md', 'express dependency plus src/ selects the Node/Express standard'
    refute_includes installed(api, '.github/instructions'), 'postgres-liquibase.instructions.md'
    assert_includes installed(api, '.agents/skills'), 'node-express-examples'

    app = build_fake_app('audited')
    _, error, status = run_install_script(app, engine, '--stage', 'audit', '--agent', 'token-audit')
    assert status.success?, error
    assert_equal %w[token-audit.agent.md], installed(app, '.github/agents')
    assert_empty installed(app, '.agents/skills') & %w[think plan code prove release-readiness decision-record]
    assert_includes installed(app, '.github/instructions'), 'sharp-agent.instructions.md'

    _, error, status = run_install_script(app, engine, '--stage', 'audit')
    refute status.success?, 'audit needs --agent'
    assert_includes error, '--agent is required'
    _, error, status = run_install_script(app, engine, '--stage', 'audit', '--agent', 'missing-audit')
    refute status.success?
    assert_includes error, "agent 'missing-audit' not found"
    _, error, status = run_install_script(app, engine, '--stage', 'ship')
    refute status.success?
    assert_includes error, 'unknown stage'
  end

  def test_closed_or_superseded_runs_skip_without_mutating_issue
    artifacts = {
      'issue_number.txt' => "42\n",
      'specs/issue-42/think.md' => "# Think: controls\n",
      'specs/issue-42/plan.md' => "# Plan: controls\n"
    }

    # 1. Closed issue skips Think, Plan, and Code without editing issue or dispatching
    closed_data = scenario(['5-release'], comments: ['# Think: controls', '# Plan: controls'], artifact_specs: artifacts)
    closed_data['issue']['state'] = 'CLOSED'

    think_closed = run_step(step('think', 'resume'), closed_data)
    assert_equal 'skip', think_closed.fetch('resumed_stage')
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }
    assert_empty dispatches

    plan_closed = run_step(step('plan', 'resolve'), closed_data, { 'INPUT_ISSUE_NUMBER' => '', 'RUN_ID' => '777' })
    assert_equal 'true', plan_closed.fetch('skip')
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }

    code_closed = run_step(step('code', 'resolve'), closed_data, { 'INPUT_ISSUE_NUMBER' => '', 'RUN_ID' => '777' })
    assert_equal 'true', code_closed.fetch('skip')
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }

    # 2. Queued handoff (RUN_ID set) skips when an earlier run already stripped stage labels (e.g. merged in Prove while Release awaits deploy)
    superseded_handoff = scenario([], comments: ['# Think: controls', '# Plan: controls', '# Prove: controls'], artifact_specs: artifacts)
    code_superseded = run_step(step('code', 'resolve'), superseded_handoff, { 'INPUT_ISSUE_NUMBER' => '', 'RUN_ID' => '777' })
    assert_equal 'true', code_superseded.fetch('skip')
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }

    plan_superseded = run_step(step('plan', 'resolve'), superseded_handoff, { 'INPUT_ISSUE_NUMBER' => '', 'RUN_ID' => '777' })
    assert_equal 'true', plan_superseded.fetch('skip')
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }

    # 3. Queued direct Code run (RUN_ID empty) skips when Prove/Release already completed after latest Plan and removed stage labels
    code_direct_done = run_step(step('code', 'resolve'), superseded_handoff, { 'INPUT_ISSUE_NUMBER' => '42', 'RUN_ID' => '' })
    assert_equal 'true', code_direct_done.fetch('skip')
    refute @calls.any? { |args| args.first(2) == %w[issue edit] }

    # 4. Checkpoints pause if all stage labels were removed while the phase was in flight
    PHASES.each do |phase|
      out = run_step(step(phase, 'checkpoint'), scenario([]))
      assert_equal 'true', out.fetch('paused'), "#{phase} checkpoint must pause when all stage labels were removed"
    end
  end

  def test_agents_auto_resume_session_when_copilot_exits_early_without_output
    calls_file = File.join(@directory, 'copilot_calls.jsonl')
    copilot_bin = File.join(@directory, 'bin/copilot')
    File.write(copilot_bin, <<~RUBY)
      #!#{RbConfig.ruby}
      require 'fileutils'
      require 'json'

      File.open(#{calls_file.inspect}, 'a') { |f| f.puts(JSON.generate(ARGV)) }
      resume_arg = ARGV.find { |a| a.start_with?('--resume=') }
      agent_arg = ARGV.find { |a| a.start_with?('--agent=') }&.split('=', 2)&.last

      if resume_arg.nil?
        puts "Reading files..."
        puts "Resume     copilot --resume=1ef982ba-2ce3-426c-a081-08a8860953ec"
        exit 0
      end

      case agent_arg
      when 'think'
        FileUtils.mkdir_p('specs/issue-42')
        File.write('specs/issue-42/think.md', "# Think: controls\\n")
        puts "Wrote think.md on resumed turn"
      when 'plan'
        FileUtils.mkdir_p('specs/issue-42')
        File.write('specs/issue-42/plan.md', "# Plan: controls\\n")
        puts "Wrote plan.md on resumed turn"
      when 'code'
        FileUtils.mkdir_p('src')
        File.write('src/controls.js', "export const controls = true;\\n")
        puts "Implemented src/controls.js on resumed turn"
      end
    RUBY
    File.chmod(0o755, copilot_bin)
    printf_exec = ENV.fetch('PATH').split(File::PATH_SEPARATOR)
                     .map { |dir| File.join(dir, 'printf') }
                     .find { |candidate| File.executable?(candidate) && !File.directory?(candidate) }
    File.symlink(printf_exec, File.join(@directory, 'bin/printf')) if printf_exec && !File.exist?(File.join(@directory, 'bin/printf'))

    data = scenario(['1-think'])
    env_vars = {
      'ISSUE_AI_MODEL' => 'gemini-3.8-flash',
      'ISSUE_AI_EFFORT' => 'medium',
      'BRANCH_NAME' => 'feature/issue-42-test',
      'BASE_REF' => 'main'
    }

    # 1. Think auto-resumes with the same model and effort when initial turn exits 0 without think.md
    FileUtils.rm_f(calls_file)
    FileUtils.rm_rf(File.join(@directory, 'specs/issue-42'))
    think_step = steps('think').find { |item| item['name'] == 'Fetch issue context and run Thinker agent' }
    run_step(think_step, data, env_vars)
    think_calls = File.readlines(calls_file).map { |l| JSON.parse(l) }
    assert_equal 2, think_calls.length
    assert_includes think_calls[0], '--model=gemini-3.8-flash'
    assert_includes think_calls[0], '--reasoning-effort=medium'
    refute think_calls[0].any? { |a| a.start_with?('--resume=') }
    assert_includes think_calls[1], '--model=gemini-3.8-flash'
    assert_includes think_calls[1], '--reasoning-effort=medium'
    assert_includes think_calls[1], '--resume=1ef982ba-2ce3-426c-a081-08a8860953ec'
    assert File.file?(File.join(@directory, 'specs/issue-42/think.md'))

    # 2. Plan auto-resumes with the same model and effort when initial turn exits 0 without plan.md
    FileUtils.rm_f(calls_file)
    FileUtils.rm_f(File.join(@directory, 'specs/issue-42/plan.md'))
    plan_step = steps('plan').find { |item| item['name'] == 'Fetch issue context and run Planner agent' }
    run_step(plan_step, data, env_vars)
    plan_calls = File.readlines(calls_file).map { |l| JSON.parse(l) }
    assert_equal 2, plan_calls.length
    assert_includes plan_calls[1], '--model=gemini-3.8-flash'
    assert_includes plan_calls[1], '--reasoning-effort=medium'
    assert_includes plan_calls[1], '--resume=1ef982ba-2ce3-426c-a081-08a8860953ec'
    assert File.file?(File.join(@directory, 'specs/issue-42/plan.md'))

    # 3. Code auto-resumes with the same model and effort when initial turn exits 0 without commits or in-scope changes
    prepare_stale_pr
    FileUtils.mkdir_p(File.join(@repository, 'specs/issue-42'))
    git_exec = ENV.fetch('PATH').split(File::PATH_SEPARATOR)
                  .map { |dir| File.join(dir, 'git') }
                  .find { |candidate| File.executable?(candidate) && !File.directory?(candidate) }
    File.symlink(git_exec, File.join(@directory, 'bin/git')) if git_exec && !File.exist?(File.join(@directory, 'bin/git'))
    FileUtils.rm_f(calls_file)
    git_command('checkout', '-B', 'feature/issue-42-test', 'refs/remotes/origin/main')
    code_step = steps('code').find { |item| item['name'] == 'Run Code Agent to implement plan.md and prepare pr.md' }
    code_env = @environment.merge(resolve_step_environment(code_step)).merge(env_vars)
    File.write(@environment.fetch('TEST_SCENARIO'), JSON.generate(data))
    output, error, status = Open3.capture3(
      code_env, File.join(@directory, 'bin/bash'), '--noprofile', '--norc', '-e', '-o', 'pipefail',
      stdin_data: code_step.fetch('run'), chdir: @repository, unsetenv_others: true
    )
    assert status.success?, "#{output}\n#{error}"
    code_calls = File.readlines(calls_file).map { |l| JSON.parse(l) }
    assert_equal 2, code_calls.length
    assert_includes code_calls[0], '--model=gemini-3.8-flash'
    assert_includes code_calls[0], '--reasoning-effort=medium'
    refute code_calls[0].any? { |a| a.start_with?('--resume=') }
    assert_includes code_calls[1], '--model=gemini-3.8-flash'
    assert_includes code_calls[1], '--reasoning-effort=medium'
    assert_includes code_calls[1], '--resume=1ef982ba-2ce3-426c-a081-08a8860953ec'
    assert File.file?(File.join(@repository, 'src/controls.js'))
    code_log = File.read(File.join(@directory, 'copilot-code.log'))
    assert_includes code_log, 'Reading files...'
    assert_includes code_log, 'Implemented src/controls.js on resumed turn'
  end
end
