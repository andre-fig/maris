import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Optional,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { GfsService } from "./gfs.service.js";
import { GFS_TILE_COLUMNS, GFS_TILE_ROWS, encodeGfsTile } from "./gfs-tiles.js";
import { GfsRedisCacheService, gfsRunId } from "./gfs-redis-cache.service.js";
import {
  downsampleGfsGrid,
  isGfsResolution,
  type GfsResolution,
} from "./gfs-resolution.js";

const GFS_SUCCESS_CACHE_CONTROL =
  "public, s-maxage=1800, stale-while-revalidate=300";

function etagFor(body: Buffer | string) {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

function isNotModified(request: Request, etag: string) {
  const value = request.header("If-None-Match");
  return value === "*" || value?.split(",").some((candidate) => candidate.trim() === etag);
}

@Controller("weather")
export class WeatherController {
  constructor(
    @Inject(GfsService) private readonly gfsService: GfsService,
    @Optional()
    @Inject(GfsRedisCacheService)
    private readonly redisCache?: GfsRedisCacheService,
  ) {}

  @Get("gfs/tiles/:x/:y")
  async getGfsTile(
    @Param("x") xValue: string,
    @Param("y") yValue: string,
    @Query("forecastHour") forecastHourValue = "0",
    @Req() request: Request,
    @Res() response: Response,
    @Query("resolution") resolutionValue = "0.25",
  ) {
    response.set("Cache-Control", "no-store");
    const x = Number(xValue);
    const y = Number(yValue);
    const forecastHour = Number(forecastHourValue);
    const resolution = Number(resolutionValue);
    if (![x, y, forecastHour].every(Number.isInteger) ||
        x < 0 || x >= GFS_TILE_COLUMNS || y < 0 || y >= GFS_TILE_ROWS ||
        forecastHour < 0 || forecastHour > 384 || !isGfsResolution(resolution)) {
      throw new BadRequestException(
        "Invalid GFS tile coordinate or forecast hour",
      );
    }
    const activeRun = await this.redisCache?.getActiveRun();
    const cachedBody = activeRun
      ? await this.redisCache?.getTile(
          activeRun.run,
          forecastHour,
          x,
          y,
          resolution,
        )
      : null;
    let body = cachedBody;
    if (!body) {
      const grid = downsampleGfsGrid(
        await this.gfsService.getTile(x, y, forecastHour),
        resolution as GfsResolution,
      );
      body = gzipSync(encodeGfsTile(grid));
      await this.redisCache?.setTile(
        gfsRunId(grid.run),
        forecastHour,
        x,
        y,
        body,
        resolution as GfsResolution,
      );
    }
    const etag = etagFor(body);
    response.set("Cache-Control", GFS_SUCCESS_CACHE_CONTROL);
    response.set("ETag", etag);
    response.set("Content-Type", "application/octet-stream");
    response.set("Content-Encoding", "gzip");
    if (isNotModified(request, etag)) {
      return response.status(304).end();
    }
    return response.status(200).send(body);
  }
}
