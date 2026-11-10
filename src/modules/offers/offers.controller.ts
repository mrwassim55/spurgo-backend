import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('offers')
@UseGuards(AuthGuard('jwt'))
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  create(@Body() createOfferDto: CreateOfferDto, @Request() req) {
    return this.offersService.create(createOfferDto, req.user);
  }

  @Get()
  findAll(@Request() req) {
    return this.offersService.findAll(req.user);
  }

  @Get('my-offers')
  findMyOffers(@Request() req) {
    return this.offersService.findMyOffers(req.user.id);
  }

  @Get('request/:requestId')
  findByRequest(@Param('requestId') requestId: string, @Request() req) {
    return this.offersService.findByRequest(requestId, req.user);
  }

  // 200 = store contact visible; 402 = { plans, pointsCost } to pay or spend points.
  @Post(':id/unlock')
  unlock(@Param('id') id: string, @Body('method') method: string, @Request() req) {
    return this.offersService.unlock(id, req.user, method);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Request() req) {
    return this.offersService.complete(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPPLIER)
  @Post(':id/rating-request')
  requestRating(@Param('id') id: string, @Request() req) {
    return this.offersService.requestRating(id, req.user.id);
  }

  @Post(':id/rate')
  rate(@Param('id') id: string, @Body('stars') stars: number, @Body('comment') comment: string, @Request() req) {
    return this.offersService.rate(id, req.user.id, stars, comment);
  }

  @Put(':id/quantity')
  updateQuantity(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @Request() req,
  ) {
    return this.offersService.updateQuantity(id, quantity, req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  adminRemove(@Param('id') id: string) {
    return this.offersService.adminRemove(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.offersService.remove(id, req.user.id);
  }
}
