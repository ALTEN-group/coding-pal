require 'fileutils'
require 'json'
require 'open3'

scenario = JSON.parse(File.read(ENV.fetch('TEST_SCENARIO')))
File.open(ENV.fetch('TEST_CALLS'), 'a') { |file| file.puts(JSON.generate(ARGV)) }

def reject_command(message)
  File.open(ENV.fetch('TEST_VIOLATIONS'), 'a') { |file| file.puts(message) }
  warn message
  exit 1
end

def argument(name)
  index = ARGV.index(name)
  index && ARGV[index + 1]
end

if ENV['GH_TOKEN'].to_s.empty?
  reject_command("Missing GH_TOKEN for gh #{ARGV.first(2).join(' ')}")
end

if ARGV.include?('--arg')
  reject_command("Invalid gh flag --arg in #{ARGV.inspect}: pipe gh --json output to jq instead")
end

if ARGV.include?('--jq') && (argument('--jq').to_s.empty? || argument('--jq').to_s.start_with?('-'))
  reject_command("Missing or invalid --jq expression in #{ARGV.inspect}")
end

if ARGV.first != 'api' && ENV['GH_REPO'].to_s.empty? && !ARGV.include?('--repo') && !ARGV.include?('-R') && !File.directory?('.git')
  reject_command("Missing repository context for gh #{ARGV.first(2).join(' ')}: set GH_REPO, pass --repo, or run inside a git checkout")
end

if ARGV.first(2) == ['repo', 'view'] && (ARGV[2].to_s.empty? || ARGV[2].to_s.start_with?('-')) && !File.directory?('.git')
  reject_command("gh repo view ignores GH_REPO outside a git checkout; pass explicit repository argument: #{ARGV.inspect}")
end

if %w[issue pr].include?(ARGV[0]) && %w[view edit comment merge close].include?(ARGV[1]) && ARGV[2].to_s.empty?
  reject_command("Missing target number/branch for gh #{ARGV.first(2).join(' ')}")
end

result = case ARGV.first(2)
         when ['pr', 'view']
           if scenario['pr_sequence']
             value = scenario.fetch('pr_sequence').shift
             reject_command('Unexpected additional PR poll') unless value
             File.write(ENV.fetch('TEST_SCENARIO'), JSON.generate(scenario))
             value
           else
             scenario.fetch('pr')
           end
         when ['pr', 'merge']
           nil
         when ['repo', 'view']
           { 'defaultBranchRef' => { 'name' => 'main' }, 'isPrivate' => Array(scenario['private_repos']).include?(ARGV[2]) }
         when ['issue', 'view']
           scenario.fetch('issue')
         when ['pr', 'list']
           scenario.fetch('prs', [])
         when ['issue', 'list']
           scenario.fetch('issues', [])
         when ['issue', 'create']
           puts 'https://github.com/1pizzateam/MappR/issues/77'
           nil
         when ['pr', 'create']
           puts 'https://example.test/pr/99'
           nil
         when ['run', 'list']
           scenario.fetch('runs', [])
         when ['run', 'download']
           reject_command("Unmocked run download: #{ARGV.inspect}") unless scenario['artifact_specs']
           dir = argument('-D') || '.'
           scenario.fetch('artifact_specs').each do |rel_path, content|
             full = File.join(dir, rel_path)
             FileUtils.mkdir_p(File.dirname(full))
             File.write(full, content)
           end
           nil
         when ['api', 'graphql']
           if scenario['api_failure']
             warn 'Mock GitHub API permission denied'
             exit 1
           end
           query = ARGV.find { |value| value.start_with?('query=', 'mutation=') }
           reject_command('Missing GraphQL query') unless query
           case query
           when /updateProjectV2ItemFieldValue/
             { 'data' => { 'updateProjectV2ItemFieldValue' => { 'projectV2Item' => { 'id' => 'ITEM' } } } }
           when /archiveProjectV2Item/
             { 'data' => { 'archiveProjectV2Item' => { 'item' => { 'id' => 'ARCHIVED_ITEM' } } } }
           when /setIssueFieldValue/
             { 'data' => { 'setIssueFieldValue' => { 'issue' => { 'id' => 'ISSUE' } } } }
           when /addProjectV2ItemById/
             (warn('gh: Content already exists in this project') || exit(1)) if scenario['content_already_exists']; { 'data' => { 'addProjectV2ItemById' => { 'item' => { 'id' => 'ITEM' } } } }
           when /projectsV2/
             scenario.fetch('project')
           when /issues\(states: \[OPEN\]/
             { 'data' => { 'repository' => { 'issues' => { 'nodes' => scenario.fetch('queue', []) } } } }
           else
             reject_command("Unexpected GraphQL operation: #{query}")
           end
         when ['workflow', 'run']
           reject_command("Unexpected dispatch: #{ARGV.inspect}") unless %w[think.yml plan.yml code.yml prove.yml release.yml audits.yml].include?(ARGV[2])
           nil
         when ['pr', 'edit']
           if scenario['track_fix_labels'] && argument('--add-label')&.start_with?('fix-loop:')
             scenario.fetch('pr').fetch('labels').reject! { |label| label.fetch('name').start_with?('fix-loop:') }
             scenario.fetch('pr').fetch('labels') << { 'name' => argument('--add-label') }
             File.write(ENV.fetch('TEST_SCENARIO'), JSON.generate(scenario))
           end
           nil
         when ->(args) { args.first == 'api' && args[1].match?(%r{\Arepos/test-owner/test-repo/actions/workflows/[^/]+/runs\?}) }
           if scenario['release_api_failure']
             warn 'Mock release API permission denied'
             exit 1
           end
           workflow = ARGV[1].split('/workflows/').last.split('/runs?').first
           responses = scenario.fetch('release_runs').fetch(workflow)
           reject_command("Unexpected additional release poll for #{workflow}") if responses.empty?
           value = responses.length > 1 ? responses.shift : responses.first
           File.write(ENV.fetch('TEST_SCENARIO'), JSON.generate(scenario))
           { 'workflow_runs' => value }
         when ['label', 'create'], ['issue', 'edit'], ['issue', 'comment'], ['issue', 'close'], ['pr', 'comment']
           nil
         else
           reject_command("Unexpected gh command: #{ARGV.inspect}")
         end

if result
  json = JSON.generate(result)
  filter = argument('--jq')
  if filter
    output, error, status = Open3.capture3('jq', '-r', filter, stdin_data: json)
    reject_command("Invalid --jq filter: #{error}") unless status.success?
    print output
  else
    puts json
  end
end
