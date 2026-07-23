# 盲测记录暂存目录

把 `/lab` 导出的 `tieban-validation-*.json` 放在此处，然后在项目根目录运行：

```powershell
npm run validation:merge
npm run validation:evaluate
```

本目录中的 JSON、合并数据集和评估结果已被 `.gitignore` 排除，不应进入公开代码仓库或 standalone 部署包。仅保留本说明文件。
