import 'reflect-metadata'; import { ClassConstructor,plainToInstance } from 'class-transformer'; import { validate } from 'class-validator'; import { pageOf } from './api-response'; import { SortDirection, toOrder } from './page-query.dto'; import { ProductQueryDto } from '../products/dto/product.dto'; import { BatchQueryDto,CodeQueryDto } from '../codes/code.dto'; import { TeamQueryDto } from '../team/team.dto';
describe('collection contract',()=>{
 it('returns complete page metadata',()=>{expect(pageOf(['a'],3,2,1,'createdAt','desc')).toEqual({data:['a'],meta:{page:2,pageSize:1,total:3,totalPages:3,hasNextPage:true,hasPreviousPage:true,sortBy:'createdAt',sortDirection:'desc'}})});
 it('applies deterministic allowlisted order',()=>{expect(toOrder('name',SortDirection.Asc,['name','createdAt']as const,'createdAt')).toEqual({name:'ASC',id:'ASC'})});
 it.each([[ProductQueryDto,'passwordHash'],[BatchQueryDto,'organizationId'],[CodeQueryDto,'activationCodeHash'],[TeamQueryDto,'tokenHash']])('rejects invalid sort key for %p',async(Type,key)=>{const dto=plainToInstance(Type as ClassConstructor<object>,{sortBy:key});expect(await validate(dto)).not.toHaveLength(0)});
 it('rejects oversized pages',async()=>{const dto=plainToInstance(ProductQueryDto,{pageSize:1000});expect(await validate(dto)).not.toHaveLength(0)});
 it('accepts product filtering, sorting and paging',async()=>{const dto=plainToInstance(ProductQueryDto,{page:2,pageSize:25,status:'active',sortBy:'name',sortDirection:'asc'});expect(await validate(dto)).toHaveLength(0)});
});
