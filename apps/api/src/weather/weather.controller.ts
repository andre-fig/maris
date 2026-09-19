import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { GfsService } from "./gfs.service.js";
import { GFS_TILE_COLUMNS, GFS_TILE_ROWS, encodeGfsTile } from "./gfs-tiles.js";

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
  constructor(@Inject(GfsService) private readonly gfsService: GfsService) {}

  @Get("gfs/tiles/:x/:y")
  async getGfsTile(
    @Param("x") xValue: string,
    @Param("y") yValue: string,
    @Query("forecastHour") forecastHourValue = "0",
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.set("Cache-Control", "no-store");
    const x = Number(xValue);
    const y = Number(yValue);
    const forecastHour = Number(forecastHourValue);
    if (![x, y, forecastHour].every(Number.isInteger) ||
        x < 0 || x >= GFS_TILE_COLUMNS || y < 0 || y >= GFS_TILE_ROWS ||
        forecastHour < 0 || forecastHour > 384) {
      throw new BadRequestException(
        "Invalid GFS tile coordinate or forecast hour",
      );
    }
    const grid = await this.gfsService.getTile(x, y, forecastHour);
    const body = gzipSync(encodeGfsTile(grid));
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
