# Laravel Cloud Branch-Based Deployments Research

## Overview

This document explores what would be involved in implementing one-click temporary deployments of Laravel applications based on Git branches, using Laravel Cloud.

---

## Laravel Cloud Preview Environments (Built-in)

Laravel Cloud has **native Preview Environment** support available on Growth, Business, and Enterprise plans.

### How It Works

1. **Trigger**: Laravel Cloud listens for pull request or new branch events on your linked GitHub repository
2. **Creation**: When triggered, a new preview environment is automatically created based on a specified existing environment (e.g., `main`)
3. **Replication**: Compute, resources, and environment variables are copied from the source environment
4. **Deployment**: Can be automatic or manual depending on settings
5. **Cleanup**: Environment can auto-destroy when the PR is merged/closed, or require manual cleanup

### Configuration Options

| Setting | Description |
|---------|-------------|
| **Automation name** | Descriptive name for the preview rule |
| **Branch filter** | Optional pattern to limit which branches trigger previews |
| **Resource handling** | Choose to duplicate, reuse, or ignore: Compute clusters, Database, Cache, Object storage |
| **Custom env vars** | Override or add environment variables |
| **Auto deploy** | Deploy automatically on trigger, or wait for manual trigger |
| **Auto destroy** | Clean up when PR is merged/closed |

### Setting Up Preview Environments

1. Go to Laravel Cloud organization dashboard
2. Select the app to configure
3. Navigate to **Settings → Preview environments**
4. Click **"+ New automation"** to create a preview rule

### Security Considerations

- Preview environments reuse the `APP_KEY` from the replicated environment
- **Avoid** connecting preview environments to production databases, caches, or sensitive resources
- Not recommended to replicate production environments for previews

---

## Laravel Cloud API

### API Status

The Laravel Cloud API is currently in **Early Access** and subject to change. Contact Laravel Cloud support for API access.

### Authentication

```bash
# Generate token at: https://cloud.laravel.com/org/my-team/settings/api-tokens

# Use in requests:
curl --request GET \
  --url https://app.laravel.cloud/api/... \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

### Known API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/applications` | POST | Create a new application |
| `/api/environments/{environment}/instances` | POST | Create a new instance for an environment |
| `/api/deployments/{deployment}` | GET | Get deployment details |
| `/api/environments/{environment}/commands` | GET | List commands for environment |
| `/api/environments/{environment}/commands` | POST | Run a command on environment |
| `/api/ips` | GET | List IP addresses to whitelist |

### API Response Format (JSON:API)

```json
{
  "data": {
    "id": "123",
    "type": "deployments",
    "attributes": {
      "status": "deploying",
      "branch_name": "feature/my-branch",
      "commit_hash": "abc123",
      "commit_message": "Add new feature",
      "php_major_version": "8.2",
      "build_command": "npm run build",
      "node_version": "20",
      "started_at": "2025-01-01T00:00:00Z",
      "finished_at": null
    },
    "relationships": {
      "environment": {
        "data": { "type": "environments", "id": "456" }
      }
    }
  }
}
```

### Environment Attributes in API Responses

- `name`, `slug`
- `status` (e.g., "deploying")
- `created_from_automation`
- `vanity_domain`
- `php_major_version`
- `build_command`
- `node_version`

---

## Programmatic Deployment with `nativephp/laravel-cloud-deploy`

A community package that wraps Laravel Cloud API functionality.

### Installation

```bash
composer require nativephp/laravel-cloud-deploy
```

### Configuration

```env
LARAVEL_CLOUD_TOKEN=your-api-token
LARAVEL_CLOUD_REPOSITORY=owner/repo
LARAVEL_CLOUD_REGION=us-east-2
```

**Available Regions:**
- `us-east-2` (Ohio)
- `us-east-1` (N. Virginia)
- `eu-west-2` (London)
- `eu-central-1` (Frankfurt)
- `ap-southeast-1` (Singapore)
- `ap-southeast-2` (Sydney)

### Commands

```bash
# Deploy to default environment
php artisan cloud:deploy

# Deploy to specific environment
php artisan cloud:deploy production

# Preview changes without deploying
php artisan cloud:deploy --dry-run

# Configure infrastructure only (no deploy)
php artisan cloud:deploy --skip-deploy --force

# Deploy with no prompts
php artisan cloud:deploy production --force
```

### Infrastructure Tracking

The package creates `.laravel-cloud.json` to track deployed infrastructure IDs:
- Enables updates to existing resources instead of duplicates
- Should be committed to git for team/CI sharing

### Configuration File (`config/cloud.php`)

```php
return [
    'name' => 'My App',
    'repository' => 'owner/repo',
    'region' => 'us-east-2',

    'environments' => [
        'production' => [
            'php' => '8.3',
            'node' => '20',
            'build_commands' => ['npm run build'],
            'deploy_commands' => ['php artisan migrate --force'],
            'server' => [
                'type' => 'octane',
                'hibernation' => true,
            ],
            'instances' => [
                'size' => 'flex.c-1vcpu-256mb',
                'scaling' => [
                    'type' => 'auto',
                    'min' => 1,
                    'max' => 10,
                ],
            ],
        ],
    ],
];
```

---

## Implementation Approach for One-Click Branch Deployments

### Option 1: Use Native Preview Environments (Recommended)

**Pros:**
- Built-in, fully supported by Laravel
- Automatic GitHub integration
- Auto-cleanup on PR close
- No custom code required

**Cons:**
- Requires Growth/Business/Enterprise plan
- Limited customization of deployment process
- UI-based configuration

**Implementation:**
1. Enable Preview Environments in Laravel Cloud dashboard
2. Configure automation rules for branches
3. Link GitHub repository
4. PRs automatically get preview URLs

### Option 2: API-Driven Custom Solution

**Pros:**
- Full control over deployment logic
- Can integrate with any Git provider
- Custom naming, resources, teardown

**Cons:**
- API is in Early Access (subject to change)
- More complex to implement
- Requires API access approval

**Implementation Steps:**

1. **Request API Access** from Laravel Cloud support

2. **Create Environment via API**
   ```typescript
   // Theoretical API call (exact endpoint TBD)
   POST /api/applications/{app}/environments
   {
     "name": "preview-branch-name",
     "clone_from": "staging",
     "branch": "feature/my-branch",
     "auto_deploy": true
   }
   ```

3. **Trigger Deployment**
   ```typescript
   POST /api/environments/{env}/deployments
   {
     "branch": "feature/my-branch",
     "commit": "abc123"
   }
   ```

4. **Clean Up**
   ```typescript
   DELETE /api/environments/{env}
   ```

### Option 3: Hybrid with GitHub Actions

Use GitHub Actions to orchestrate Laravel Cloud deployments:

```yaml
# .github/workflows/preview.yml
name: Preview Environment

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    if: github.event.action != 'closed'
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Laravel Cloud
        run: php artisan cloud:deploy preview-${{ github.event.pull_request.number }} --force
        env:
          LARAVEL_CLOUD_TOKEN: ${{ secrets.LARAVEL_CLOUD_TOKEN }}

      - name: Comment PR with URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview deployed to: https://preview-${{ github.event.pull_request.number }}.your-app.laravel.cloud'
            })

  cleanup-preview:
    runs-on: ubuntu-latest
    if: github.event.action == 'closed'
    steps:
      - name: Destroy Preview Environment
        run: |
          # Call Laravel Cloud API to destroy environment
          curl -X DELETE \
            -H "Authorization: Bearer ${{ secrets.LARAVEL_CLOUD_TOKEN }}" \
            "https://app.laravel.cloud/api/environments/preview-${{ github.event.pull_request.number }}"
```

---

## Comparison with Alternatives

### Laravel Forge + Glimpse

[Glimpse](https://glimpse.sh/) provides preview environments for Laravel Forge:
- Automatic PR deployments
- Unique subdomains per PR
- SSL certificates
- Auto-cleanup on merge/close

### Laravel Forge + laravel-deploy-preview

[GitHub Action](https://github.com/bakerkretzmar/laravel-deploy-preview):
- Creates sites on Forge with unique subdomains
- Database per preview
- SSL certificates
- Scheduled job setup
- Quick Deploy enabled

### Laravel Vapor

Serverless Laravel on AWS:
- Native preview environment support
- Similar concept to Laravel Cloud
- More mature API

---

## Integration with Ledger

To add one-click Laravel Cloud deployments to Ledger:

### Required UI Components

1. **Deploy Button** on branch/PR panels
2. **Environment Status** indicator
3. **Preview URL** display
4. **Destroy Environment** action

### Required API Integration

```typescript
// lib/main/laravel-cloud-service.ts

interface LaravelCloudConfig {
  token: string;
  appId: string;
  baseUrl: string;
}

interface PreviewEnvironment {
  id: string;
  name: string;
  status: 'deploying' | 'running' | 'failed' | 'destroying';
  url: string;
  branch: string;
  createdAt: string;
}

class LaravelCloudService {
  async createPreviewEnvironment(branch: string): Promise<PreviewEnvironment>
  async getEnvironmentStatus(envId: string): Promise<PreviewEnvironment>
  async destroyEnvironment(envId: string): Promise<void>
  async triggerDeploy(envId: string): Promise<Deployment>
}
```

### IPC Channels

| Channel | Parameters | Returns |
|---------|------------|---------|
| `laravel-cloud:create-preview` | `branch: string` | `{ success, environment }` |
| `laravel-cloud:get-status` | `envId: string` | `PreviewEnvironment` |
| `laravel-cloud:destroy` | `envId: string` | `{ success }` |
| `laravel-cloud:list-previews` | - | `PreviewEnvironment[]` |

---

## Next Steps

1. **Request Laravel Cloud API Early Access** to get full endpoint documentation
2. **Prototype** using `nativephp/laravel-cloud-deploy` package approach
3. **Evaluate** built-in Preview Environments vs custom API solution
4. **Design UI** for deploy controls in Ledger
5. **Implement** IPC handlers and service layer

---

## Sources

- [Laravel Cloud Environments Documentation](https://cloud.laravel.com/docs/environments)
- [Laravel Cloud API - Create Instance](https://cloud.laravel.com/docs/api/instances/create-instance)
- [Laravel Cloud API - Create Application](https://cloud.laravel.com/docs/api/applications/create-application)
- [Laravel Cloud API - Get Deployment](https://cloud.laravel.com/docs/api/deployments/get-deployment)
- [Laravel Cloud API - Authentication](https://cloud.laravel.com/docs/api/authentication)
- [nativephp/laravel-cloud-deploy Package](https://packagist.org/packages/nativephp/laravel-cloud-deploy)
- [Laracon US 2025 Announcements](https://blog.laravel.com/everything-we-announced-at-laracon-us-2025)
- [Glimpse - Preview PRs with Laravel Forge](https://glimpse.sh/)
- [Laravel Deploy Preview GitHub Action](https://github.com/bakerkretzmar/laravel-deploy-preview)
