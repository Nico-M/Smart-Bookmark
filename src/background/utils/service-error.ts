/**
 * 统一服务层错误类型，便于消息层映射为标准错误码。
 */
export class ServiceError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}
