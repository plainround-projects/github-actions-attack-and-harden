# demo environment

Composes the two modules: a private release bucket and the IAM role the `production` deploy job assumes through GitHub
OIDC.

## Validate without an AWS account

```bash
terraform -chdir=infra/environments/demo init -backend=false
terraform -chdir=infra/environments/demo validate
terraform -chdir=infra/environments/demo plan -var-file=offline.tfvars -out=plan.bin
```

`offline.tfvars` sets `offline = true`, which skips every AWS call; the plan shows 9 resources to add. The same plan,
converted with `terraform show -json plan.bin`, feeds `pipeline/check-trust-cli.ts`, which tries eight tokens against
the rendered trust policy (`make check-trust`).

## Deploy (when the account exists; nothing here runs automatically)

```bash
cp infra/environments/demo/demo.tfvars.example infra/environments/demo/demo.tfvars   # then edit it
terraform -chdir=infra/environments/demo apply -var-file=demo.tfvars
```

Then set the repository variables from the outputs (they are not secrets) and create the protected environment, see
the README's "Deploy" section. Cost: IAM and the OIDC provider are free; the bucket costs cents per month.

## Tear down

```bash
terraform -chdir=infra/environments/demo destroy -var-file=demo.tfvars
```

`force_destroy` is on for the demo bucket, so it is removed with its releases.
