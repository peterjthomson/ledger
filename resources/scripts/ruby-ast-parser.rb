#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby Code Parser for Code Graph
#
# Parses Ruby files using regex patterns to extract:
# - require/require_relative statements
# - Class declarations (with inheritance)
# - Module declarations
# - include/extend/prepend statements
#
# Usage: ruby ruby-ast-parser.rb /path/to/repo
# Output: JSON to stdout
#
# Note: This uses regex-based parsing (not AST) for zero external dependencies.
# Less accurate than AST parsing but works without gems.

require 'json'
require 'pathname'
require 'time'

# Check arguments
if ARGV.empty?
  puts JSON.generate({
    success: false,
    message: 'Usage: ruby ruby-ast-parser.rb /path/to/repo',
    nodes: [],
    edges: []
  })
  exit 1
end

repo_path = File.expand_path(ARGV[0])

unless File.directory?(repo_path)
  puts JSON.generate({
    success: false,
    message: "Directory not found: #{ARGV[0]}",
    nodes: [],
    edges: []
  })
  exit 1
end

# Detect if this is a Rails project
def rails_project?(repo_path)
  File.exist?(File.join(repo_path, 'config', 'application.rb')) ||
    (File.exist?(File.join(repo_path, 'Gemfile')) && 
     File.read(File.join(repo_path, 'Gemfile')).include?('rails'))
end

# Get Rails-specific directories to parse (Models + Controllers only)
def rails_directories(repo_path)
  dirs = []
  
  # Models
  models_dir = File.join(repo_path, 'app', 'models')
  dirs << models_dir if Dir.exist?(models_dir)
  
  # Controllers
  controllers_dir = File.join(repo_path, 'app', 'controllers')
  dirs << controllers_dir if Dir.exist?(controllers_dir)
  
  # Services if they exist (common pattern)
  services_dir = File.join(repo_path, 'app', 'services')
  dirs << services_dir if Dir.exist?(services_dir)
  
  dirs
end

# Find Ruby files in specific directories only
def find_ruby_files_in_dirs(dirs, repo_path)
  files = []
  
  dirs.each do |dir|
    next unless Dir.exist?(dir)
    
    Dir.glob(File.join(dir, '**', '*.rb')).each do |file|
      files << file
    end
  end
  
  files
end

# Find all Ruby files in a directory (fallback for non-Rails)
def find_ruby_files(dir, repo_path)
  files = []
  exclude_dirs = %w[vendor node_modules .git tmp log coverage spec test .bundle db config]

  Dir.glob(File.join(dir, '**', '*.rb')).each do |file|
    relative_path = Pathname.new(file).relative_path_from(Pathname.new(repo_path)).to_s

    # Skip excluded directories
    next if exclude_dirs.any? { |excluded| relative_path.start_with?("#{excluded}/") || relative_path.include?("/#{excluded}/") }

    files << file
  end

  files
end

# Parse a Ruby file using regex patterns
def parse_ruby_file(file_path, relative_path)
  nodes = []
  edges = []
  
  begin
    content = File.read(file_path, encoding: 'UTF-8')
  rescue => e
    return { nodes: nodes, edges: edges }
  end
  
  lines = content.lines
  current_namespace = []
  
  lines.each_with_index do |line, index|
    line_num = index + 1
    
    # Match require/require_relative
    if line =~ /^\s*require\s+['"]([^'"]+)['"]/
      specifier = $1
      edges << {
        id: "#{relative_path}--imports--#{specifier}",
        kind: 'imports',
        source: relative_path,
        target: specifier,
        resolved: false,
        line: line_num,
        specifier: specifier
      }
    end
    
    if line =~ /^\s*require_relative\s+['"]([^'"]+)['"]/
      specifier = $1
      edges << {
        id: "#{relative_path}--imports--#{specifier}",
        kind: 'imports',
        source: relative_path,
        target: specifier,
        resolved: false,
        line: line_num,
        specifier: specifier
      }
    end
    
    # Match class definitions with optional inheritance
    if line =~ /^\s*class\s+([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)(?:\s*<\s*([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*))?/
      class_name = $1
      parent_class = $2
      
      # Get just the class name without namespacing for the node
      simple_name = class_name.split('::').last
      node_id = "#{relative_path}##{simple_name}"
      
      nodes << {
        id: node_id,
        kind: 'class',
        name: simple_name,
        displayName: simple_name,
        filePath: relative_path,
        line: line_num,
        language: 'ruby',
        namespace: current_namespace.empty? ? nil : current_namespace.join('::'),
        exported: true
      }
      
      if parent_class
        edges << {
          id: "#{node_id}--extends--#{parent_class}",
          kind: 'extends',
          source: node_id,
          target: parent_class,
          resolved: false,
          line: line_num
        }
      end
      
      current_namespace.push(simple_name)
    end
    
    # Match module definitions
    if line =~ /^\s*module\s+([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)/
      module_name = $1
      simple_name = module_name.split('::').last
      node_id = "#{relative_path}##{simple_name}"
      
      nodes << {
        id: node_id,
        kind: 'module',
        name: simple_name,
        displayName: simple_name,
        filePath: relative_path,
        line: line_num,
        language: 'ruby',
        namespace: current_namespace.empty? ? nil : current_namespace.join('::'),
        exported: true
      }
      
      current_namespace.push(simple_name)
    end
    
    # Match include/extend/prepend
    if line =~ /^\s*(include|extend|prepend)\s+([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)/
      mixin_type = $1
      mixin_name = $2
      
      unless current_namespace.empty?
        current_class = "#{relative_path}##{current_namespace.last}"
        edges << {
          id: "#{current_class}--includes--#{mixin_name}",
          kind: 'includes',
          source: current_class,
          target: mixin_name,
          resolved: false,
          line: line_num
        }
      end
    end
    
    # Track end statements to pop namespace (simplified)
    if line =~ /^\s*end\s*$/
      current_namespace.pop unless current_namespace.empty?
    end
  end
  
  { nodes: nodes, edges: edges }
end

# Main execution
begin
  all_nodes = []
  all_edges = []
  file_nodes = {}
  framework = 'generic'

  # Detect Rails and parse only Models/Controllers for speed
  if rails_project?(repo_path)
    framework = 'rails'
    rails_dirs = rails_directories(repo_path)
    ruby_files = find_ruby_files_in_dirs(rails_dirs, repo_path)
  else
    ruby_files = find_ruby_files(repo_path, repo_path)
  end

  ruby_files.each do |file_path|
    relative_path = Pathname.new(file_path).relative_path_from(Pathname.new(repo_path)).to_s

    # Add file node
    file_nodes[relative_path] = {
      id: relative_path,
      kind: 'file',
      name: File.basename(relative_path),
      displayName: File.basename(relative_path),
      filePath: relative_path,
      line: 1,
      language: 'ruby'
    }

    result = parse_ruby_file(file_path, relative_path)
    all_nodes.concat(result[:nodes])
    all_edges.concat(result[:edges])
  end

  # Merge results
  all_nodes = file_nodes.values + all_nodes

  # Deduplicate edges
  seen_edges = {}
  unique_edges = all_edges.select do |edge|
    key = "#{edge[:source]}--#{edge[:kind]}--#{edge[:target]}"
    if seen_edges[key]
      false
    else
      seen_edges[key] = true
      true
    end
  end

  puts JSON.generate({
    success: true,
    nodes: all_nodes,
    edges: unique_edges,
    language: 'ruby',
    framework: framework,
    rootPath: repo_path,
    parsedAt: Time.now.iso8601,
    parserVersion: '1.0.0',
    filesScanned: ruby_files.length
  })

rescue => e
  puts JSON.generate({
    success: false,
    message: e.message,
    nodes: [],
    edges: []
  })
  exit 1
end
