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

@Controller('offers')
@UseGuards(AuthGuard('jwt'))
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  create(@Body() createOfferDto: CreateOfferDto, @Request() req) {
    return this.offersService.create(createOfferDto, req.user.id);
  }

  @Get()
  findAll() {
    return this.offersService.findAll();
  }

  @Get('my-offers')
  findMyOffers(@Request() req) {
    return this.offersService.findMyOffers(req.user.id);
  }

  @Get('request/:requestId')
  findByRequest(@Param('requestId') requestId: string) {
    return this.offersService.findByRequest(requestId);
  }

  @Put(':id/quantity')
  updateQuantity(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @Request() req,
  ) {
    return this.offersService.updateQuantity(id, quantity, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.offersService.remove(id, req.user.id);
  }
}
