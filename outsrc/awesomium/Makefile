# lib files
lib_target=bin/libawesomium-1-7.so.4.0
lib_process=bin/awesomium_process

# includes path
include_path=include/Awesomium

# installation paths
install_path_lib=/usr/lib
install_path_include=/usr/include

# lib names
libname_shared_major_version=libawesomium-1-7.so.4
libname_shared=libawesomium-1-7.so

# hello sample file
hello_program=samples/hello/main.cc

install: $(lib_target)
	@echo "Installing Awesomium 1.7.4"
	cp -f ./$(lib_target) $(install_path_lib)
	cp -f ./$(lib_process) $(install_path_lib)
	cp -rf ./$(include_path) $(install_path_include)
	cd $(install_path_lib) ; \
	ln -sf $(lib_target) $(libname_shared_major_version) ; \
	ln -sf $(libname_shared_major_version) $(libname_shared)
	ldconfig
	@echo "Finished installation."

awesomium_sample_hello: $(hello_program) 
	@echo "Compiling Hello World"
	g++ -o ./bin/$@ $(hello_program) -lawesomium-1-7
	@echo "Finished compilation."

all: install awesomium_sample_hello
