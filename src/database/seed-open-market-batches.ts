import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import { OpenMarketBatchEntity } from '../codes/code.entity';
import { LabelType } from '../codes/code.enums';

const definitions = [
  { publicBatchId:'2607-0001-5001', activationCode:'731905', quantity:5, labelType:LabelType.Main, totalCost:75 },
  { publicBatchId:'2607-0002-6002', activationCode:'284617', quantity:6, labelType:LabelType.Micro, totalCost:90 },
  { publicBatchId:'2607-0003-7003', activationCode:'956240', quantity:7, labelType:LabelType.Pair, totalCost:105 },
  { publicBatchId:'2607-0004-8004', activationCode:'418753', quantity:8, labelType:LabelType.Main, totalCost:120 },
  { publicBatchId:'2607-0005-9005', activationCode:'602841', quantity:9, labelType:LabelType.Micro, totalCost:135 },
] as const;

async function seedOpenMarketBatches() {
  const app=await NestFactory.createApplicationContext(AppModule,{logger:['error','warn']});
  try{
    const repository=app.get(DataSource).getRepository(OpenMarketBatchEntity);
    for(const definition of definitions){
      const existing=await repository.findOneBy({publicBatchId:definition.publicBatchId});
      if(existing?.status==='claimed'){
        throw new Error(`Seed batch ${definition.publicBatchId} has already been claimed and will not be overwritten`);
      }
      const activationCodeHash=await argon2.hash(definition.activationCode,{type:argon2.argon2id});
      await repository.save(repository.create({
        ...existing,
        publicBatchId:definition.publicBatchId,
        activationCodeHash,
        quantity:definition.quantity,
        labelType:definition.labelType,
        totalCost:definition.totalCost,
        status:'available',
        claimedAt:undefined,
        claimedByOrganizationId:undefined,
        claimedCodeBatchId:undefined,
      }));
    }
    console.log(JSON.stringify(definitions.map(({activationCode,...batch})=>({...batch,activationCode,status:'available',productId:null})),null,2));
  }finally{
    await app.close();
  }
}

seedOpenMarketBatches().catch((error:unknown)=>{
  console.error(error instanceof Error?error.message:error);
  process.exitCode=1;
});
