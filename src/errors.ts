/** 审核失败的可展示错误；消息已做脱敏处理，可原样返回给工作模型。 */
export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

/** 审核请求超时；携带超时预算，供阻断原因回传给工作模型。 */
export class ReviewTimeoutError extends ReviewError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`审核模型请求超时（${timeoutMs} 毫秒）。`);
    this.name = "ReviewTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
