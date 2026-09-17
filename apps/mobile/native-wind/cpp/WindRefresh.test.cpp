#include "WindCore.hpp"
#include "WindFade.hpp"
#include <cassert>
#include <iostream>

int main() {
  maris::Plan plan{1,0,0,1,0};
  maris::Field old(plan), next(plan), empty(plan), partial(plan);
  std::vector<uint8_t> a(256*256*4), b(a.size());
  for (size_t i=0;i<a.size();i+=4) {
    a[i]=130; a[i+1]=132; a[i+3]=255; // (1,2) m/s
    b[i]=138; b[i+1]=140; b[i+3]=255; // (5,6) m/s
  }
  for (int x=0;x<2;x++) { old.put(x,0,a.data(),1024); next.put(x,0,b.data(),1024); }
  partial.put(0,0,b.data(),1024);
  assert(!maris::canPublish(&old,empty)); // Offline/failed refresh keeps old.
  assert(!maris::canPublish(&old,partial)); // No holes replacing complete data.
  assert(maris::canPublish(nullptr,partial)); // Initial partial coverage still works.
  assert(maris::canPublish(&old,next));
  maris::WindFade fade;
  fade.update(true,10);
  float u,v;
  assert(maris::sampleTransition(next,&old,fade.value,.25,.25,u,v));
  assert(u==1 && v==2);
  auto progress=fade.update(true,10.2);
  assert(maris::sampleTransition(next,&old,progress,.25,.25,u,v));
  assert(std::abs(u-3)<.001 && std::abs(v-4)<.001);
  assert(maris::sampleTransition(next,&old,fade.update(true,10.5),.25,.25,u,v));
  assert(u==5 && v==6);
  auto same=maris::previousUv(plan,plan);
  assert(same[0]==1 && same[1]==1 && same[2]==0 && same[3]==0);
  auto coarse=maris::previousUv({2,1,0,2,1},{1,0,0,1,1});
  assert(coarse[0]==.5 && coarse[1]==.5 && coarse[2]==.25 && coarse[3]==0);
  // Missing new pixels keep previous valid vectors during the transition.
  assert(maris::sampleTransition(partial,&old,.5,.75,.25,u,v));
  assert(u==1 && v==2);
  std::cout << "WindRefresh: empty/partial rejection, complete publication, continuous vectors and cross-zoom UV mapping passed\n";
}
