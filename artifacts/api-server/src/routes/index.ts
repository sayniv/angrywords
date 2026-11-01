import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cluesRouter from "./clues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cluesRouter);

export default router;
