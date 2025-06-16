import { Config } from "..";
import { Logger } from "koishi";
import { randomUUID } from "crypto";
import { JmTaskPayload } from "../processors/jmProcessor";

/**
 * 任务可能的状态
 * pending: 等待处理
 * processing: 正在处理
 * completed: 处理完成
 * failed: 处理失败
 */
type TaskStatus = "pending" | "processing" | "completed" | "failed";

// 任务的数据结构
interface Task {
  id: string;
  payload: JmTaskPayload;
  status: TaskStatus;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

// 处理器函数的类型定义
type TaskProcessor = (payload: JmTaskPayload) => Promise<void>;

// 队列构造函数的选项
interface QueueOptions {
  concurrency?: number;
}

export class Queue {
  private tasks: Task[] = [];
  private processor: TaskProcessor;
  private readonly concurrency: number;
  private activeTasks: number = 0;
  /**
   * koishi 配置项
   */
  private config: Config;
  /**
   * koishi 日志
   */
  private logger: Logger;

  constructor(
    processor: TaskProcessor,
    options: QueueOptions = {},
    config: Config,
    logger: Logger
  ) {
    this.config = config;
    this.logger = logger;
    this.processor = processor;
    this.concurrency = options.concurrency || 1;
  }

  /**
   * 向队列添加一个新任务
   */
  public add(payload: JmTaskPayload): Task {
    const task: Task = {
      id: randomUUID(),
      payload,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.tasks.push(task);
    if (this.config.debug)
      this.logger.info(
        `[任务添加] 任务ID: ${payload} 类型: ${payload.type} ID: ${payload.id}`
      );

    // 异步地尝试处理队列
    setTimeout(() => this._processQueue(), 0);

    return task;
  }

  /**
   * 获取任务状态
   */
  public getTask(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /**
   * 获取所有任务的只读列表
   */
  public getAllTasks(): Readonly<Task[]> {
    return this.tasks;
  }

  /**
   * 检查并处理队列中的任务
   */
  private _processQueue(): void {
    while (this.activeTasks < this.concurrency) {
      const task = this.tasks.find((t) => t.status === "pending");
      if (!task) {
        break; // 没有待处理任务
      }

      this.activeTasks++;
      task.status = "processing";
      if (this.config.debug)
        this.logger.info(
          `[任务开始] 任务ID: ${task.id} 类型: ${task.payload.type} ID: ${task.payload.id}`
        );

      this._runTask(task);
    }
  }

  /**
   * 执行单个任务
   */
  private async _runTask(task: Task): Promise<void> {
    try {
      // 执行定义的处理逻辑
      await this.processor(task.payload);

      // 任务成功
      task.status = "completed";
      if (this.config.debug)
        this.logger.info(
          `[任务成功] 任务ID: ${task.id} 类型: ${task.payload.type} ID: ${task.payload.id}`
        );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (this.config.debug)
        this.logger.error(
          `[任务失败] 任务ID: ${task.id} 类型: ${task.payload.type} ID: ${task.payload.id}, 错误: ${errorMessage}`
        );

      // 任务失败，直接标记为 failed，不再重试
      task.status = "failed";
      task.error = errorMessage;
    } finally {
      task.processedAt = new Date().toISOString();
      this.activeTasks--;
      this._processQueue(); // 尝试处理下一个任务
    }
  }
}
