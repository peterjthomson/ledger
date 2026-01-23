#!/usr/bin/env php
<?php
/**
 * PHP AST Parser for Code Graph
 *
 * Parses PHP files to extract:
 * - Use statements (imports)
 * - Class declarations (with extends/implements)
 * - Trait usage
 * - Interface declarations
 *
 * Usage: php php-ast-parser.php /path/to/repo
 * Output: JSON to stdout
 *
 * Uses bundled nikic/php-parser - no external dependencies required.
 */

// Load the bundled autoloader (shipped with the app)
$autoloader = __DIR__ . '/vendor/autoload.php';

if (!file_exists($autoloader)) {
    echo json_encode([
        'success' => false,
        'message' => 'Bundled PHP parser not found. The Ledger app may be corrupted.',
        'nodes' => [],
        'edges' => [],
    ]);
    exit(1);
}

require_once $autoloader;

use PhpParser\ParserFactory;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitor\NameResolver;
use PhpParser\NodeVisitorAbstract;
use PhpParser\Node;

// Check arguments
if ($argc < 2) {
    echo json_encode([
        'success' => false,
        'message' => 'Usage: php php-ast-parser.php /path/to/repo',
        'nodes' => [],
        'edges' => [],
    ]);
    exit(1);
}

$repoPath = realpath($argv[1]);
if (!$repoPath || !is_dir($repoPath)) {
    echo json_encode([
        'success' => false,
        'message' => "Directory not found: {$argv[1]}",
        'nodes' => [],
        'edges' => [],
    ]);
    exit(1);
}

/**
 * Visitor to collect dependencies from PHP AST
 */
class DependencyCollector extends NodeVisitorAbstract
{
    public array $nodes = [];
    public array $edges = [];
    public string $currentFile = '';
    public string $repoPath = '';
    private array $imports = [];
    private ?string $currentNamespace = null;

    public function beforeTraverse(array $nodes)
    {
        $this->imports = [];
        $this->currentNamespace = null;
        return null;
    }

    public function enterNode(Node $node)
    {
        // Track namespace
        if ($node instanceof Node\Stmt\Namespace_) {
            $this->currentNamespace = $node->name ? $node->name->toString() : null;
        }

        // Collect use statements (imports)
        if ($node instanceof Node\Stmt\Use_) {
            foreach ($node->uses as $use) {
                $fqn = $use->name->toString();
                $alias = $use->alias ? $use->alias->toString() : $use->name->getLast();
                $this->imports[$alias] = $fqn;

                $this->edges[] = [
                    'id' => "{$this->currentFile}--imports--{$fqn}",
                    'kind' => 'imports',
                    'source' => $this->currentFile,
                    'target' => $fqn,
                    'resolved' => false, // Will be resolved later
                    'line' => $node->getStartLine(),
                    'specifier' => $fqn,
                ];
            }
        }

        // Grouped use statements
        if ($node instanceof Node\Stmt\GroupUse) {
            $prefix = $node->prefix->toString();
            foreach ($node->uses as $use) {
                $fqn = $prefix . '\\' . $use->name->toString();
                $alias = $use->alias ? $use->alias->toString() : $use->name->getLast();
                $this->imports[$alias] = $fqn;

                $this->edges[] = [
                    'id' => "{$this->currentFile}--imports--{$fqn}",
                    'kind' => 'imports',
                    'source' => $this->currentFile,
                    'target' => $fqn,
                    'resolved' => false,
                    'line' => $node->getStartLine(),
                    'specifier' => $fqn,
                ];
            }
        }

        // Class declarations
        if ($node instanceof Node\Stmt\Class_) {
            $className = $node->name ? $node->name->toString() : 'anonymous';
            $fqn = $this->currentNamespace ? "{$this->currentNamespace}\\{$className}" : $className;
            $nodeId = "{$this->currentFile}#{$className}";
            
            // Determine category from file path
            $category = 'other';
            if (strpos($this->currentFile, '/Models/') !== false || strpos($this->currentFile, '/Model/') !== false) {
                $category = 'model';
            } elseif (strpos($this->currentFile, '/Controllers/') !== false || strpos($this->currentFile, '/Controller/') !== false) {
                $category = 'controller';
            } elseif (strpos($this->currentFile, '/Services/') !== false || strpos($this->currentFile, '/Service/') !== false) {
                $category = 'service';
            }

            $this->nodes[] = [
                'id' => $nodeId,
                'kind' => 'class',
                'name' => $className,
                'displayName' => $className,
                'filePath' => $this->currentFile,
                'line' => $node->getStartLine(),
                'endLine' => $node->getEndLine(),
                'language' => 'php',
                'namespace' => $this->currentNamespace,
                'exported' => true,
                'category' => $category,
            ];

            // Extends
            if ($node->extends) {
                $parentName = $node->extends->toString();
                $this->edges[] = [
                    'id' => "{$nodeId}--extends--{$parentName}",
                    'kind' => 'extends',
                    'source' => $nodeId,
                    'target' => $parentName,
                    'resolved' => false,
                    'line' => $node->getStartLine(),
                ];
            }

            // Implements
            foreach ($node->implements as $impl) {
                $interfaceName = $impl->toString();
                $this->edges[] = [
                    'id' => "{$nodeId}--implements--{$interfaceName}",
                    'kind' => 'implements',
                    'source' => $nodeId,
                    'target' => $interfaceName,
                    'resolved' => false,
                    'line' => $node->getStartLine(),
                ];
            }
        }

        // Trait use within class
        if ($node instanceof Node\Stmt\TraitUse) {
            // Find parent class
            $parent = $this->findParentClass($node);
            if ($parent) {
                $className = $parent->name ? $parent->name->toString() : 'anonymous';
                $nodeId = "{$this->currentFile}#{$className}";

                foreach ($node->traits as $trait) {
                    $traitName = $trait->toString();
                    $this->edges[] = [
                        'id' => "{$nodeId}--includes--{$traitName}",
                        'kind' => 'includes',
                        'source' => $nodeId,
                        'target' => $traitName,
                        'resolved' => false,
                        'line' => $node->getStartLine(),
                    ];
                }
            }
        }

        // Interface declarations
        if ($node instanceof Node\Stmt\Interface_) {
            $interfaceName = $node->name->toString();
            $nodeId = "{$this->currentFile}#{$interfaceName}";

            $this->nodes[] = [
                'id' => $nodeId,
                'kind' => 'interface',
                'name' => $interfaceName,
                'displayName' => $interfaceName,
                'filePath' => $this->currentFile,
                'line' => $node->getStartLine(),
                'endLine' => $node->getEndLine(),
                'language' => 'php',
                'namespace' => $this->currentNamespace,
                'exported' => true,
            ];

            // Interface extends
            foreach ($node->extends as $ext) {
                $parentName = $ext->toString();
                $this->edges[] = [
                    'id' => "{$nodeId}--extends--{$parentName}",
                    'kind' => 'extends',
                    'source' => $nodeId,
                    'target' => $parentName,
                    'resolved' => false,
                    'line' => $node->getStartLine(),
                ];
            }
        }

        // Trait declarations
        if ($node instanceof Node\Stmt\Trait_) {
            $traitName = $node->name->toString();
            $nodeId = "{$this->currentFile}#{$traitName}";

            $this->nodes[] = [
                'id' => $nodeId,
                'kind' => 'trait',
                'name' => $traitName,
                'displayName' => $traitName,
                'filePath' => $this->currentFile,
                'line' => $node->getStartLine(),
                'endLine' => $node->getEndLine(),
                'language' => 'php',
                'namespace' => $this->currentNamespace,
                'exported' => true,
            ];
        }

        return null;
    }

    private function findParentClass(Node $node): ?Node\Stmt\Class_
    {
        // This is a simplified version - in practice we'd need to track this
        // during traversal. For now, return null.
        return null;
    }
}

/**
 * Detect if this is a Laravel project
 */
function isLaravelProject(string $repoPath): bool
{
    return file_exists($repoPath . '/artisan') && file_exists($repoPath . '/app');
}

/**
 * Get Laravel-specific directories to parse (Models + Controllers only)
 */
function getLaravelDirectories(string $repoPath): array
{
    $dirs = [];
    
    // Models - check both old and new Laravel structure
    if (is_dir($repoPath . '/app/Models')) {
        $dirs[] = $repoPath . '/app/Models';
    } elseif (is_dir($repoPath . '/app')) {
        // Old Laravel structure - models in app/ root
        $dirs[] = $repoPath . '/app';
    }
    
    // Controllers
    if (is_dir($repoPath . '/app/Http/Controllers')) {
        $dirs[] = $repoPath . '/app/Http/Controllers';
    }
    
    // Services if they exist (common pattern)
    if (is_dir($repoPath . '/app/Services')) {
        $dirs[] = $repoPath . '/app/Services';
    }
    
    return $dirs;
}

/**
 * Find PHP files in specific directories only
 */
function findPhpFilesInDirs(array $dirs, string $repoPath): array
{
    $files = [];
    
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) continue;
        
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }
    }
    
    return $files;
}

/**
 * Recursively find PHP files in a directory (fallback for non-Laravel)
 */
function findPhpFiles(string $dir, string $repoPath): array
{
    $files = [];
    $excludeDirs = ['vendor', 'node_modules', '.git', 'storage', 'cache', 'tests', 'database', 'resources', 'public', 'bootstrap'];

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $file) {
        // Skip excluded directories
        $relativePath = str_replace($repoPath . '/', '', $file->getPathname());
        $pathParts = explode('/', $relativePath);
        $shouldSkip = false;
        foreach ($pathParts as $part) {
            if (in_array($part, $excludeDirs)) {
                $shouldSkip = true;
                break;
            }
        }
        if ($shouldSkip) continue;

        if ($file->isFile() && $file->getExtension() === 'php') {
            $files[] = $file->getPathname();
        }
    }

    return $files;
}

// Main execution
try {
    $parser = (new ParserFactory)->createForNewestSupportedVersion();
    $traverser = new NodeTraverser();
    $traverser->addVisitor(new NameResolver());

    $collector = new DependencyCollector();
    $collector->repoPath = $repoPath;
    $traverser->addVisitor($collector);

    $allNodes = [];
    $allEdges = [];
    $fileNodes = [];
    $framework = 'generic';

    // Detect Laravel and parse only Models/Controllers for speed
    if (isLaravelProject($repoPath)) {
        $framework = 'laravel';
        $laravelDirs = getLaravelDirectories($repoPath);
        $phpFiles = findPhpFilesInDirs($laravelDirs, $repoPath);
    } else {
        $phpFiles = findPhpFiles($repoPath, $repoPath);
    }

    foreach ($phpFiles as $filePath) {
        $relativePath = str_replace($repoPath . '/', '', $filePath);
        $collector->currentFile = $relativePath;

        // Add file node
        // Determine category from file path
        $fileCategory = 'other';
        if (strpos($relativePath, '/Models/') !== false || strpos($relativePath, '/Model/') !== false) {
            $fileCategory = 'model';
        } elseif (strpos($relativePath, '/Controllers/') !== false || strpos($relativePath, '/Controller/') !== false) {
            $fileCategory = 'controller';
        } elseif (strpos($relativePath, '/Services/') !== false || strpos($relativePath, '/Service/') !== false) {
            $fileCategory = 'service';
        }
        
        $fileNodes[$relativePath] = [
            'id' => $relativePath,
            'kind' => 'file',
            'name' => basename($relativePath),
            'displayName' => basename($relativePath),
            'filePath' => $relativePath,
            'line' => 1,
            'language' => 'php',
            'category' => $fileCategory,
        ];

        $code = file_get_contents($filePath);

        try {
            $ast = $parser->parse($code);
            if ($ast) {
                $traverser->traverse($ast);
            }
        } catch (Exception $e) {
            // Skip files that can't be parsed
            continue;
        }
    }

    // Merge results
    $allNodes = array_merge(array_values($fileNodes), $collector->nodes);
    $allEdges = $collector->edges;

    // Build a map of class names to node IDs for resolution
    $classNameToNodeId = [];
    $nodeIdToCategory = [];
    foreach ($collector->nodes as $node) {
        if (in_array($node['kind'], ['class', 'interface', 'trait'])) {
            // Map by simple name
            $classNameToNodeId[$node['name']] = $node['id'];
            $nodeIdToCategory[$node['id']] = $node['category'] ?? 'other';
            // Also map by fully qualified name if namespace exists
            if (!empty($node['namespace'])) {
                $fqn = $node['namespace'] . '\\' . $node['name'];
                $classNameToNodeId[$fqn] = $node['id'];
            }
        }
    }
    // Also map file nodes to categories
    foreach ($fileNodes as $fileNode) {
        $nodeIdToCategory[$fileNode['id']] = $fileNode['category'] ?? 'other';
    }

    // Resolve edges - match targets to known classes
    $resolvedEdges = [];
    foreach ($allEdges as $edge) {
        $target = $edge['target'];
        $resolved = false;
        $resolvedTarget = $target;

        // Skip import edges (use statements) - focus on class relationships
        if ($edge['kind'] === 'imports') {
            // Check if it's an internal class import
            $shortName = basename(str_replace('\\', '/', $target));
            if (isset($classNameToNodeId[$shortName])) {
                $resolvedTarget = $classNameToNodeId[$shortName];
                $resolved = true;
            } elseif (isset($classNameToNodeId[$target])) {
                $resolvedTarget = $classNameToNodeId[$target];
                $resolved = true;
            }
            // Skip external imports (Illuminate, etc.) entirely
            if (!$resolved) {
                continue;
            }
        } else {
            // For extends/implements/includes - try to resolve
            $shortName = basename(str_replace('\\', '/', $target));
            if (isset($classNameToNodeId[$shortName])) {
                $resolvedTarget = $classNameToNodeId[$shortName];
                $resolved = true;
            } elseif (isset($classNameToNodeId[$target])) {
                $resolvedTarget = $classNameToNodeId[$target];
                $resolved = true;
            }
            // Skip common base classes that create noise (everything extends these)
            $baseClasses = [
                // Laravel base classes
                'Model', 'Controller', 'Request', 'Resource', 'Collection', 
                'Job', 'Mailable', 'Notification', 'Event', 'Listener',
                'Command', 'Middleware', 'Policy', 'Provider', 'Seeder',
                'Factory', 'Migration', 'Test', 'TestCase',
                // Common base controller patterns
                'BaseController', 'ApiController', 'AdminController',
                'AuthController', 'FormRequest', 'JsonResource',
                // Eloquent
                'Pivot', 'Builder', 'Scope',
            ];
            
            $shortTarget = basename(str_replace('\\', '/', $target));
            if (in_array($shortTarget, $baseClasses) || in_array($target, $baseClasses)) {
                continue;
            }
            
            // Keep unresolved extends/implements only if they're NOT framework classes
            if (!$resolved) {
                // Skip Laravel/Illuminate framework classes
                if (strpos($target, 'Illuminate\\') === 0 || 
                    strpos($target, 'Laravel\\') === 0) {
                    continue;
                }
            }
        }

        $edge['target'] = $resolvedTarget;
        $edge['resolved'] = $resolved;
        
        // Skip controller-to-controller edges (too noisy due to base controllers)
        $sourceCategory = $nodeIdToCategory[$edge['source']] ?? 'other';
        $targetCategory = $nodeIdToCategory[$resolvedTarget] ?? 'other';
        if ($sourceCategory === 'controller' && $targetCategory === 'controller') {
            continue;
        }
        
        $resolvedEdges[] = $edge;
    }

    // Deduplicate edges
    $seenEdges = [];
    $uniqueEdges = [];
    foreach ($resolvedEdges as $edge) {
        $key = "{$edge['source']}--{$edge['kind']}--{$edge['target']}";
        if (!isset($seenEdges[$key])) {
            $seenEdges[$key] = true;
            $uniqueEdges[] = $edge;
        }
    }
    
    // Iteratively filter to nodes with 2+ connections
    // (removing nodes may cause others to drop below threshold)
    $currentEdges = $uniqueEdges;
    $currentNodeIds = [];
    foreach ($allNodes as $node) {
        $currentNodeIds[$node['id']] = true;
    }
    
    $changed = true;
    while ($changed) {
        $changed = false;
        
        // Count connections per node from current edges
        $nodeConnectionCount = [];
        foreach ($currentEdges as $edge) {
            if (isset($currentNodeIds[$edge['source']]) && isset($currentNodeIds[$edge['target']])) {
                $nodeConnectionCount[$edge['source']] = ($nodeConnectionCount[$edge['source']] ?? 0) + 1;
                $nodeConnectionCount[$edge['target']] = ($nodeConnectionCount[$edge['target']] ?? 0) + 1;
            }
        }
        
        // Remove nodes with < 2 connections
        $newNodeIds = [];
        foreach ($currentNodeIds as $nodeId => $v) {
            $count = $nodeConnectionCount[$nodeId] ?? 0;
            if ($count >= 2) {
                $newNodeIds[$nodeId] = true;
            } else {
                $changed = true;
            }
        }
        $currentNodeIds = $newNodeIds;
        
        // Filter edges to only those between remaining nodes
        $newEdges = [];
        foreach ($currentEdges as $edge) {
            if (isset($currentNodeIds[$edge['source']]) && isset($currentNodeIds[$edge['target']])) {
                $newEdges[] = $edge;
            }
        }
        $currentEdges = $newEdges;
    }
    
    // Build final node list
    $connectedNodes = [];
    foreach ($allNodes as $node) {
        if (isset($currentNodeIds[$node['id']])) {
            $connectedNodes[] = $node;
        }
    }
    $filteredEdges = $currentEdges;

    echo json_encode([
        'success' => true,
        'nodes' => $connectedNodes,
        'edges' => $filteredEdges,
        'language' => 'php',
        'framework' => $framework,
        'rootPath' => $repoPath,
        'parsedAt' => date('c'),
        'parserVersion' => '1.0.0',
        'filesScanned' => count($phpFiles),
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'nodes' => [],
        'edges' => [],
    ]);
    exit(1);
}
