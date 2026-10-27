variable "bucket_name" {
  description = "Globally unique bucket name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be 3 to 63 lowercase letters, digits, dots or hyphens."
  }
}

variable "force_destroy" {
  description = "Let `terraform destroy` delete the bucket even when it holds objects. True only for throwaway environments."
  type        = bool
  default     = false
}

variable "noncurrent_version_days" {
  description = "Days an overwritten or deleted object version is kept."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags for the bucket."
  type        = map(string)
  default     = {}
}
